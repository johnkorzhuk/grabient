'use node'

import { nanoid } from 'nanoid'
import Cloudflare from 'cloudflare'
import { action } from './_generated/server'
import { api } from './_generated/api'
import { v } from 'convex/values'
import { vRefinementModel } from './lib/providers.types'

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'
const VECTORIZE_INDEX = 'grabient-palettes'
const SEARCH_CACHE_KV_NAMESPACE_ID = '04596938aa91477eb1c38d45f3d1b9f3'
const BATCH_SIZE = 100 // Workers AI batch limit
const UPSERT_BATCH_SIZE = 1000 // Vectorize recommends max 5000, we'll use 1000 for safety
const DELETE_BATCH_SIZE = 100 // Vectorize max is 100 IDs per delete request
const D1_BATCH_SIZE = 50 // Keep small due to long seed strings

interface VectorizeVector {
  id: string
  values: number[]
  metadata: {
    seed: string
    tags: string[]
    style: string
    steps: number
    angle: number
    likesCount: number
    createdAt: string
  }
}

interface D1PaletteData {
  seed: string
  style: string
  steps: number
  angle: number
  likesCount: number
  createdAt: string
}

interface RefinedPalette {
  seed: string
  embedText: string
  tags: {
    mood?: string[]
    style?: string[]
    dominant_colors?: string[]
    harmony?: string[]
    seasonal?: string[]
    associations?: string[]
  }
  error?: string
}

interface SeedResult {
  success: boolean
  message: string
  stats: {
    total: number
    valid?: number
    embedded?: number
    upserted?: number
    vectorsCleared?: number
    kvKeysCleared?: number
  }
}

function extractTagsFromEmbedText(
  embedText: string,
  knownMultiWordTags: Set<string>
): string[] {
  let text = embedText.toLowerCase().trim()
  const foundTags: string[] = []

  const sortedMultiWordTags = Array.from(knownMultiWordTags).sort(
    (a, b) => b.length - a.length
  )

  for (const multiWordTag of sortedMultiWordTags) {
    let idx = text.indexOf(multiWordTag)
    while (idx !== -1) {
      const beforeOk = idx === 0 || text[idx - 1] === ' '
      const afterIdx = idx + multiWordTag.length
      const afterOk = afterIdx === text.length || text[afterIdx] === ' '

      if (beforeOk && afterOk) {
        foundTags.push(multiWordTag)
        text = text.slice(0, idx) + ' '.repeat(multiWordTag.length) + text.slice(afterIdx)
      }
      idx = text.indexOf(multiWordTag, idx + 1)
    }
  }

  const remainingWords = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  foundTags.push(...remainingWords)
  return foundTags
}

function buildMultiWordTagSet(
  refinements: Array<{
    tags: {
      mood?: string[]
      style?: string[]
      dominant_colors?: string[]
      harmony?: string[]
      seasonal?: string[]
      associations?: string[]
    }
  }>
): Set<string> {
  const knownMultiWordTags = new Set<string>()

  for (const r of refinements) {
    const tags = r.tags
    for (const arr of [
      tags.mood,
      tags.style,
      tags.dominant_colors,
      tags.harmony,
      tags.seasonal,
      tags.associations,
    ]) {
      if (arr) {
        for (const tag of arr) {
          if (tag) {
            const normalized = tag.toLowerCase().trim()
            if (normalized.includes(' ')) {
              knownMultiWordTags.add(normalized)
            }
          }
        }
      }
    }
  }

  return knownMultiWordTags
}

async function clearVectorIndex(
  client: Cloudflare,
  accountId: string
): Promise<number> {
  console.log('Listing all vectors in index...')
  const allIds: string[] = []
  let cursor: string | undefined

  do {
    const response = await client.vectorize.indexes.listVectors(
      VECTORIZE_INDEX,
      { account_id: accountId, cursor }
    )

    if (response?.vectors) {
      for (const v of response.vectors) {
        allIds.push(v.id)
      }
    }

    cursor = response?.nextCursor ?? undefined
  } while (cursor)

  if (allIds.length === 0) {
    console.log('No vectors to clear')
    return 0
  }

  console.log(`Found ${allIds.length} vectors to delete`)

  for (let i = 0; i < allIds.length; i += DELETE_BATCH_SIZE) {
    const batch = allIds.slice(i, i + DELETE_BATCH_SIZE)
    await client.vectorize.indexes.deleteByIds(VECTORIZE_INDEX, {
      account_id: accountId,
      ids: batch,
    })
    console.log(
      `Deleted batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1}/${Math.ceil(allIds.length / DELETE_BATCH_SIZE)}: ${batch.length} vectors`
    )
  }

  return allIds.length
}

async function clearKVCache(
  accountId: string,
  apiToken: string
): Promise<number> {
  console.log('Clearing KV search cache...')
  const allKeys: string[] = []
  let cursor: string | undefined

  do {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${SEARCH_CACHE_KV_NAMESPACE_ID}/keys`
    )
    if (cursor) {
      url.searchParams.set('cursor', cursor)
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiToken}` },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`KV list keys error: ${response.status} - ${error}`)
    }

    const result = await response.json() as {
      success: boolean
      result: Array<{ name: string }>
      result_info?: { cursor?: string }
    }

    for (const key of result.result) {
      allKeys.push(key.name)
    }

    cursor = result.result_info?.cursor
  } while (cursor)

  if (allKeys.length === 0) {
    console.log('No KV keys to clear')
    return 0
  }

  console.log(`Found ${allKeys.length} KV keys to delete`)

  const KV_DELETE_BATCH_SIZE = 10000
  for (let i = 0; i < allKeys.length; i += KV_DELETE_BATCH_SIZE) {
    const batch = allKeys.slice(i, i + KV_DELETE_BATCH_SIZE)

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${SEARCH_CACHE_KV_NAMESPACE_ID}/bulk`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`KV bulk delete error: ${response.status} - ${error}`)
    }

    console.log(
      `Deleted KV batch ${Math.floor(i / KV_DELETE_BATCH_SIZE) + 1}/${Math.ceil(allKeys.length / KV_DELETE_BATCH_SIZE)}: ${batch.length} keys`
    )
  }

  return allKeys.length
}

async function fetchPaletteDataFromD1(
  seeds: string[],
  accountId: string,
  apiToken: string,
  databaseId: string
): Promise<Map<string, D1PaletteData>> {
  const paletteMap = new Map<string, D1PaletteData>()

  for (let i = 0; i < seeds.length; i += D1_BATCH_SIZE) {
    const batch = seeds.slice(i, i + D1_BATCH_SIZE)
    const placeholders = batch.map(() => '?').join(',')
    const sql = `
      SELECT
        p.id as seed,
        p.style,
        p.steps,
        p.angle,
        p.created_at as createdAt,
        COUNT(l.palette_id) as likesCount
      FROM palettes p
      LEFT JOIN likes l ON p.id = l.palette_id
      WHERE p.id IN (${placeholders})
      GROUP BY p.id
    `

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params: batch }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`D1 query error: ${response.status} - ${error}`)
    }

    const data = await response.json() as {
      success: boolean
      result?: Array<{ results?: D1PaletteData[] }>
    }

    if (!data.success || !data.result?.[0]?.results) {
      throw new Error(`D1 query failed: ${JSON.stringify(data)}`)
    }

    const results = data.result[0].results
    for (const row of results) {
      paletteMap.set(row.seed, row)
    }

    console.log(
      `D1 batch ${Math.floor(i / D1_BATCH_SIZE) + 1}/${Math.ceil(seeds.length / D1_BATCH_SIZE)}: fetched ${results.length} palettes`
    )
  }

  return paletteMap
}

async function generateEmbeddings(
  texts: string[],
  client: Cloudflare,
  accountId: string
): Promise<number[][]> {
  const result = await client.ai.run(EMBEDDING_MODEL, {
    account_id: accountId,
    text: texts,
  })

  if (!result || !('data' in result) || !result.data) {
    throw new Error('Workers AI did not return embedding data')
  }

  return result.data as number[][]
}

async function upsertVectors(
  vectors: VectorizeVector[],
  accountId: string,
  apiToken: string
): Promise<string> {
  const ndjson = vectors.map((v) => JSON.stringify(v)).join('\n')

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/x-ndjson',
      },
      body: ndjson,
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Vectorize upsert error: ${response.status} - ${error}`)
  }

  const result = await response.json() as {
    success: boolean
    result: { mutationId: string }
  }

  return result.result.mutationId
}

export const seedVectorDatabase = action({
  args: {
    model: vRefinementModel,
    cycle: v.number(),
  },
  handler: async (ctx, { model, cycle }): Promise<SeedResult> => {
    const accountId = process.env.CF_ACCOUNT_ID
    const apiToken = process.env.CF_API_TOKEN
    const d1DatabaseId = process.env.CF_D1_DATABASE_ID

    if (!accountId) {
      throw new Error('Missing CF_ACCOUNT_ID environment variable')
    }
    if (!apiToken) {
      throw new Error('Missing CF_API_TOKEN environment variable')
    }
    if (!d1DatabaseId) {
      throw new Error('Missing CF_D1_DATABASE_ID environment variable')
    }

    const client = new Cloudflare({ apiToken })

    // Step 1: Clear existing vectors
    console.log('Step 1: Clearing existing vectors...')
    const vectorsCleared = await clearVectorIndex(client, accountId)

    // Step 2: Clear KV cache
    console.log('Step 2: Clearing KV search cache...')
    const kvKeysCleared = await clearKVCache(accountId, apiToken)

    // Step 3: Fetch refinements
    console.log(`Step 3: Fetching refined palettes for model=${model}, cycle=${cycle}...`)
    const refinements: RefinedPalette[] = await ctx.runQuery(api.refinement.getRefinedPalettes, {
      model,
      cycle,
    })

    if (refinements.length === 0) {
      return {
        success: true,
        message: 'No refinements found for this model/cycle',
        stats: { total: 0, vectorsCleared, kvKeysCleared },
      }
    }

    console.log(`Found ${refinements.length} refinements`)

    const validRefinements = refinements.filter(
      (r): r is RefinedPalette & { embedText: string; tags: NonNullable<RefinedPalette['tags']> } =>
        !r.error && !!r.embedText && !!r.tags
    )

    if (validRefinements.length === 0) {
      return {
        success: true,
        message: 'No valid refinements (all have errors or missing data)',
        stats: { total: refinements.length, vectorsCleared, kvKeysCleared },
      }
    }

    console.log(`Processing ${validRefinements.length} valid refinements`)

    // Step 4: Fetch palette data from D1
    console.log('Step 4: Fetching palette data from D1...')
    const seeds = validRefinements.map((r) => r.seed)
    const paletteDataMap = await fetchPaletteDataFromD1(seeds, accountId, apiToken, d1DatabaseId)
    console.log(`Found ${paletteDataMap.size} palettes in D1`)

    const knownMultiWordTags = buildMultiWordTagSet(
      validRefinements.map((r) => ({ tags: r.tags }))
    )

    const palettesData = validRefinements
      .filter((r) => paletteDataMap.has(r.seed))
      .map((r) => {
        const d1Data = paletteDataMap.get(r.seed)!
        return {
          seed: r.seed,
          embedText: r.embedText,
          tags: extractTagsFromEmbedText(r.embedText, knownMultiWordTags),
          style: d1Data.style,
          steps: d1Data.steps,
          angle: d1Data.angle,
          likesCount: d1Data.likesCount,
          createdAt: d1Data.createdAt,
        }
      })

    // Step 5: Generate embeddings
    console.log(`Step 5: Generating embeddings in batches of ${BATCH_SIZE}...`)
    const allEmbeddings: number[][] = []

    for (let i = 0; i < palettesData.length; i += BATCH_SIZE) {
      const batch = palettesData.slice(i, i + BATCH_SIZE)
      const texts = batch.map((p) => p.embedText)

      console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(palettesData.length / BATCH_SIZE)}`)
      const embeddings = await generateEmbeddings(texts, client, accountId)
      allEmbeddings.push(...embeddings)
    }

    console.log(`Generated ${allEmbeddings.length} embeddings`)

    // Step 6: Upsert vectors (use nanoid since seeds are too long for Vectorize max 64 bytes)
    const vectors: VectorizeVector[] = palettesData.map((p, i) => ({
      id: nanoid(),
      values: allEmbeddings[i],
      metadata: {
        seed: p.seed,
        tags: p.tags,
        style: p.style,
        steps: p.steps,
        angle: p.angle,
        likesCount: p.likesCount,
        createdAt: p.createdAt,
      },
    }))

    console.log(`Step 6: Upserting ${vectors.length} vectors in batches of ${UPSERT_BATCH_SIZE}...`)
    let totalUpserted = 0

    for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE)
      console.log(`Upserting batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}/${Math.ceil(vectors.length / UPSERT_BATCH_SIZE)}`)

      const mutationId = await upsertVectors(batch, accountId, apiToken)
      console.log(`Batch upserted with mutationId: ${mutationId}`)
      totalUpserted += batch.length
    }

    console.log(`Successfully upserted ${totalUpserted} vectors`)

    return {
      success: true,
      message: `Successfully seeded ${totalUpserted} palettes to vector database`,
      stats: {
        total: refinements.length,
        valid: validRefinements.length,
        embedded: allEmbeddings.length,
        upserted: totalUpserted,
        vectorsCleared,
        kvKeysCleared,
      },
    }
  },
})
