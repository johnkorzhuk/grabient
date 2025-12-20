'use node'

import { nanoid } from 'nanoid'
import Cloudflare from 'cloudflare'
import { action } from './_generated/server'
import { api, internal } from './_generated/api'
import { v } from 'convex/values'
import { vRefinementModel, PALETTE_STYLES, type PaletteStyle } from './lib/providers.types'
import { deserializeCoeffs } from '@repo/data-ops/serialization'
import {
  analyzeCoefficients,
  tagsToArray,
  isValidPaletteCoeffs,
  generatePaletteEmojis,
  cosineGradient,
  rgbToHex,
  applyGlobals,
} from '@repo/data-ops/gradient-gen'
import { hexToColorName } from '@repo/data-ops/color-utils'
import type { Id } from './_generated/dataModel'

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'
const VECTORIZE_INDEX = 'grabient-palettes'
const SEARCH_CACHE_KV_NAMESPACE_ID = '04596938aa91477eb1c38d45f3d1b9f3'
const BATCH_SIZE = 100 // Workers AI batch limit
const UPSERT_BATCH_SIZE = 1000 // Vectorize recommends max 5000, we'll use 1000 for safety
const DELETE_BATCH_SIZE = 100 // Vectorize max is 100 IDs per delete request
const D1_BATCH_SIZE = 50 // Keep small due to long seed strings
const SEED_STEPS = 11 // Steps for extracting color names from seed
function getColorNamesFromSeed(seed: string): string[] {
  try {
    const { coeffs, globals } = deserializeCoeffs(seed)
    const appliedCoeffs = applyGlobals(coeffs, globals)
    const rgbColors = cosineGradient(SEED_STEPS, appliedCoeffs)

    const colorNames: string[] = []
    const seen = new Set<string>()
    for (const color of rgbColors) {
      const hex = rgbToHex(color[0], color[1], color[2])
      const name = hexToColorName(hex)
      if (!seen.has(name)) {
        seen.add(name)
        colorNames.push(name)
      }
    }
    return colorNames
  } catch {
    return []
  }
}

interface VectorizeVector {
  id: string
  values: number[]
  metadata: {
    seed: string
    tags: string[]
    // Note: style/steps/angle are derived from seed at display time
    likesCount: number
    createdAt: number
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
    insertedToConvex?: number
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
        // Extract color names from seed (what shows in search heading)
        const colorNames = getColorNamesFromSeed(r.seed)
        // Prepend color names to embed text for better search matching
        const enhancedEmbedText = [...colorNames, r.embedText].join(' ')
        // Validate style is a known palette style, default to linearGradient
        const style: PaletteStyle = (PALETTE_STYLES as readonly string[]).includes(d1Data.style)
          ? (d1Data.style as PaletteStyle)
          : 'linearGradient'
        return {
          seed: r.seed,
          embedText: enhancedEmbedText,
          tags: extractTagsFromEmbedText(r.embedText, knownMultiWordTags),
          style,
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
    const vectorIds = palettesData.map(() => nanoid())
    const vectors: VectorizeVector[] = palettesData.map((p, i) => ({
      id: vectorIds[i],
      values: allEmbeddings[i],
      metadata: {
        seed: p.seed,
        tags: p.tags,
        style: p.style,
        steps: p.steps,
        angle: p.angle,
        likesCount: p.likesCount,
        createdAt: new Date(p.createdAt).getTime(),
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

    // Step 7: Insert into vectorized_palettes table
    console.log('Step 7: Inserting into vectorized_palettes table...')
    const INSERT_BATCH_SIZE = 100
    let insertedCount = 0

    for (let i = 0; i < palettesData.length; i += INSERT_BATCH_SIZE) {
      const batchPalettes = palettesData.slice(i, i + INSERT_BATCH_SIZE)
      const batchVectorIds = vectorIds.slice(i, i + INSERT_BATCH_SIZE)

      const palettesToInsert = batchPalettes.map((p, idx) => ({
        // D1-sourced palettes don't have sourceId/modelKey/themes
        seed: p.seed,
        embedText: p.embedText,
        tags: p.tags,
        vectorId: batchVectorIds[idx]!,
      }))

      const result = await ctx.runMutation(internal.generate.insertVectorizedPalettes, {
        palettes: palettesToInsert,
      })
      insertedCount += result.count
    }

    console.log(`Inserted ${insertedCount} records into vectorized_palettes`)

    return {
      success: true,
      message: `Successfully seeded ${totalUpserted} palettes to vector database`,
      stats: {
        total: refinements.length,
        valid: validRefinements.length,
        embedded: allEmbeddings.length,
        upserted: totalUpserted,
        insertedToConvex: insertedCount,
        vectorsCleared,
        kvKeysCleared,
      },
    }
  },
})

// =============================================================================
// Staged Palettes Vectorization
// =============================================================================

interface StagedPaletteVectorizeResult {
  success: boolean
  message: string
  stats: {
    queried: number
    valid: number
    skipped: number
    embedded: number
    upserted: number
    insertedToConvex: number
  }
}

/**
 * Vectorize staged palettes - processes unvectorized palettes from staged_palettes table
 *
 * This action:
 * 1. Queries unvectorized staged_palettes (up to `limit`)
 * 2. Validates each palette (colors + coefficients)
 * 3. Generates embed text (emojis + tags + themes)
 * 4. Calls Workers AI for embeddings (batched)
 * 5. Upserts to Vectorize index
 * 6. Inserts records into vectorized_palettes table
 */
export const vectorizeStagedPalettes = action({
  args: {
    limit: v.optional(v.number()),
    revectorize: v.optional(v.boolean()),
  },
  handler: async (ctx, { limit = 1000, revectorize = false }): Promise<StagedPaletteVectorizeResult> => {
    const accountId = process.env.CF_ACCOUNT_ID
    const apiToken = process.env.CF_API_TOKEN

    if (!accountId) {
      throw new Error('Missing CF_ACCOUNT_ID environment variable')
    }
    if (!apiToken) {
      throw new Error('Missing CF_API_TOKEN environment variable')
    }

    const client = new Cloudflare({ apiToken })

    // Step 1: Query staged palettes
    const mode = revectorize ? 're-vectorization' : 'vectorization'
    console.log(`Step 1: Querying up to ${limit} palettes for ${mode}...`)
    const stagedPalettes = await ctx.runQuery(api.generate.getUnvectorizedStagedPalettes, { limit, revectorize }) as Array<{
      _id: Id<'staged_palettes'>
      sourceId: Id<'generated_palettes'>
      seed: string
      modelKey?: string
      themes: string[]
    }>

    if (stagedPalettes.length === 0) {
      return {
        success: true,
        message: 'No unvectorized staged palettes found',
        stats: { queried: 0, valid: 0, skipped: 0, embedded: 0, upserted: 0, insertedToConvex: 0 },
      }
    }

    console.log(`Found ${stagedPalettes.length} palettes for ${mode}`)

    // For revectorize mode, delete existing vectorized_palettes entries first
    if (revectorize) {
      console.log('Deleting existing vectorized_palettes entries for re-vectorization...')
      const seeds = stagedPalettes.map((p) => p.seed)
      const DELETE_BATCH = 100
      for (let i = 0; i < seeds.length; i += DELETE_BATCH) {
        const batch = seeds.slice(i, i + DELETE_BATCH)
        await ctx.runMutation(internal.generate.deleteVectorizedPalettes, { seeds: batch })
      }
    }

    // Step 2: Validate and prepare palettes
    console.log('Step 2: Validating palettes and generating embed text...')
    const validPalettes: Array<{
      sourceId: Id<'generated_palettes'>
      seed: string
      modelKey?: string
      themes: string[]
      embedText: string
      tags: string[]
    }> = []
    let skipped = 0

    for (const palette of stagedPalettes) {
      // Validate and analyze coefficients
      try {
        const { coeffs } = deserializeCoeffs(palette.seed)
        if (!isValidPaletteCoeffs(coeffs)) {
          skipped++
          continue
        }

        // Generate tags from coefficients
        const paletteTags = analyzeCoefficients(coeffs)
        const tagArray = tagsToArray(paletteTags)
        const emojis = generatePaletteEmojis(paletteTags)

        // Extract unique color names from seed (derive colors from coefficients)
        const colorNames = getColorNamesFromSeed(palette.seed)

        // Deduplicate themes
        const uniqueThemes = [...new Set(palette.themes)]

        // Build embed text: emojis + color names + tags + themes (deduplicated)
        const allTokens = [...emojis, ...colorNames, ...tagArray, ...uniqueThemes]
        const uniqueTokens = [...new Set(allTokens)]
        const embedText = uniqueTokens.join(' ')

        // Deduplicate tags array as well
        const uniqueTags = [...new Set([...tagArray, ...uniqueThemes])]

        validPalettes.push({
          sourceId: palette.sourceId,
          seed: palette.seed,
          modelKey: palette.modelKey,
          themes: uniqueThemes,
          embedText,
          tags: uniqueTags,
        })
      } catch {
        skipped++
        continue
      }
    }

    console.log(`Valid: ${validPalettes.length}, Skipped: ${skipped}`)

    if (validPalettes.length === 0) {
      return {
        success: true,
        message: 'All palettes were invalid or skipped',
        stats: { queried: stagedPalettes.length, valid: 0, skipped, embedded: 0, upserted: 0, insertedToConvex: 0 },
      }
    }

    // Step 3: Generate embeddings in batches
    console.log(`Step 3: Generating embeddings in batches of ${BATCH_SIZE}...`)
    const allEmbeddings: number[][] = []

    for (let i = 0; i < validPalettes.length; i += BATCH_SIZE) {
      const batch = validPalettes.slice(i, i + BATCH_SIZE)
      const texts = batch.map((p) => p.embedText)

      console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validPalettes.length / BATCH_SIZE)} (${batch.length} items)`)
      const embeddings = await generateEmbeddings(texts, client, accountId)
      allEmbeddings.push(...embeddings)
    }

    console.log(`Generated ${allEmbeddings.length} embeddings`)

    // Step 4: Build vectors with nanoid and upsert to Vectorize
    console.log(`Step 4: Upserting ${validPalettes.length} vectors...`)
    const vectorIds = validPalettes.map(() => nanoid()) // Generate vectorIds upfront

    const vectors: VectorizeVector[] = validPalettes.map((p, i) => ({
      id: vectorIds[i],
      values: allEmbeddings[i]!,
      metadata: {
        seed: p.seed,
        tags: p.tags,
        // Note: style/steps/angle are derived from seed at display time
        likesCount: 0,
        createdAt: Date.now(),
      },
    }))

    let totalUpserted = 0
    for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE)
      console.log(`Upserting batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}/${Math.ceil(vectors.length / UPSERT_BATCH_SIZE)} (${batch.length} vectors)`)

      const mutationId = await upsertVectors(batch, accountId, apiToken)
      console.log(`Batch upserted with mutationId: ${mutationId}`)
      totalUpserted += batch.length
    }

    // Step 5: Insert into vectorized_palettes table
    console.log('Step 5: Inserting into vectorized_palettes table...')
    const INSERT_BATCH_SIZE = 100
    let insertedCount = 0

    for (let i = 0; i < validPalettes.length; i += INSERT_BATCH_SIZE) {
      const batchPalettes = validPalettes.slice(i, i + INSERT_BATCH_SIZE)
      const batchVectorIds = vectorIds.slice(i, i + INSERT_BATCH_SIZE)

      const palettesToInsert = batchPalettes.map((p, idx) => ({
        sourceId: p.sourceId,
        seed: p.seed,
        modelKey: p.modelKey,
        themes: p.themes,
        embedText: p.embedText,
        tags: p.tags,
        vectorId: batchVectorIds[idx]!,
      }))

      const result = await ctx.runMutation(internal.generate.insertVectorizedPalettes, {
        palettes: palettesToInsert,
      })
      insertedCount += result.count

      console.log(`Inserted batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1}/${Math.ceil(validPalettes.length / INSERT_BATCH_SIZE)} (${result.count} records)`)
    }

    console.log(`Inserted ${insertedCount} records into vectorized_palettes`)

    // Step 6: Check if all staged palettes are now vectorized, if so clear KV cache
    const remainingStats = await ctx.runQuery(api.generate.getStagedPalettesVectorizeStats, {})
    if (remainingStats.unvectorized <= 0) {
      console.log('All staged palettes vectorized! Clearing KV search cache...')
      const kvKeysCleared = await clearKVCache(accountId, apiToken)
      console.log(`Cleared ${kvKeysCleared} KV cache keys`)
    } else {
      console.log(`${remainingStats.unvectorized} palettes still unvectorized, skipping KV cache clear`)
    }

    return {
      success: true,
      message: `Successfully vectorized ${totalUpserted} staged palettes`,
      stats: {
        queried: stagedPalettes.length,
        valid: validPalettes.length,
        skipped,
        embedded: allEmbeddings.length,
        upserted: totalUpserted,
        insertedToConvex: insertedCount,
      },
    }
  },
})
