# @grabient/search

Palette search as vectors. A palette's colors and a query's words land in one 64-dimension space, and a search is
nearest neighbors. Plain TypeScript on `@grabient/engine` with no DOM, Solid or Cloudflare imports, so the Worker, the
browser, the offline tools and the training steps run the same code and a vector means the same thing everywhere.
Import a module by its path (`@grabient/search/text.ts`).

The Worker's side (the snapshot it answers from, the routes, the counts, the votes and the tags) is in
`apps/web/src/server/search`. The browser's (the search field, the tags row and search by image) is in
`apps/web/src/features/search`.

| File | What it holds |
| --- | --- |
| `src/features.ts` | A palette as 281 numbers: a soft color histogram over a fixed codebook, then 25 structure numbers |
| `src/codebook.data.ts` | The 256 OKLab colors the histogram is measured against. Every vector depends on them |
| `src/tower.ts` | The model in plain arithmetic: the palette side, the text side and the file format |
| `src/vectors.ts` | A palette's vector from its seed, blends, and a collection's vector from its words and palettes |
| `src/text.ts` | Query normalization, words in every script, both spellings, typo forgiveness and the relationship a query names |
| `src/lexicon.ts` | The vocabulary's keys: the whole text, one slip off, word by word, and the emoji |
| `src/words.ts` | The words a query is read without, and the ones that say how its palettes are drawn |
| `src/snapshot.ts` | The snapshot's file format and its build from the site's public palettes and collections |
| `src/colors.ts` | Hex codes in a query and the palettes they make |
| `src/picture.ts` | A picture's colors, read from its pixels, so a search by image never sends the picture anywhere |
| `test/fixtures/model-check.json` | Reference numbers from the training code, which `src/tower.test.ts` holds this arithmetic to |
| `train/` | The training data and the two Python steps |

The engine never changes for search. If the engine's curve changes, retrain.

## The model files

`apps/web/public/search/`, served as static assets and read by the Worker once per isolate:

- `tower.bin`: the palette side and the text side for `@cf/google/embeddinggemma-300m`.
- `tower-fallback.bin`: the same palette side with a text side for `@cf/baai/bge-m3`. Switching embedders needs no new
  palette vectors.
- `vocab.json`, `vocab.bin`, `lex.json`: the vocabulary, one query vector per phrase, and every spelling and translation
  that leads to a phrase.
- `emoji.json`: the emoji the search reads, each as the vocabulary phrase it stands for, drawn from Unicode CLDR's
  English emoji annotations by `apps/web/scripts/search/emoji.ts`.
- `snapshot.bin`: the site's public palettes and collections as vectors, as a deploy ships them, with every title its
  palettes are given and the names their collections' descriptions of them write. The Worker's scheduled builds start
  from it and keep their own copy in R2, named after the model version.

## Training data

- `train/data/pairs.json`: 14,793 pairs of a search phrase and a small palette (hex colors). 8,228 were written by
  language models for 2,057 phrases (`source: llm`). The rest are built by formula around named colors: the XKCD color
  survey (`xkcd`) and a designer color list (`meodai`). No palette of the site is in this file.
- `train/data/translations.json`: the 2,057 phrases in 19 languages, and the color names the interface shows in each of
  its own. An entry is one form or a list of forms.
- `train/cache/app-pairs.json`, written by `index.ts pairs`: the site's public collections, each title's subject paired
  with its palettes. Git ignores `train/cache`.

The vocabulary is what people type: the `llm` phrases, the XKCD names and the collection subjects. The designer list
trains the model and stays out of the lexicon.

The XKCD color survey is in the public domain (CC0). meodai's Color Names is under the MIT License, and the CLDR
annotations are under the Unicode License v3.

## Retrain

You need Python 3.10 or newer with `numpy` and `torch` (`pip install -r packages/search/train/requirements.txt`), and
cf logged in (`cf auth login`): the texts are embedded by Workers AI on that account, which bills them once, since the
embeddings are cached. A GPU trains in about a minute, a CPU in a few. From `apps/web`:

```bash
node scripts/search/index.ts export            # read-only export of the public palettes and collections (--local for the local D1)
node scripts/search/index.ts pairs             # the collections as training pairs
node scripts/search/train-features.ts          # every training palette through the engine and src/features.ts
node scripts/search/train-texts.ts             # the phrases and translations, embedded with both models
python ../../packages/search/train/train.py --embedder gemma --name primary
python ../../packages/search/train/train.py --embedder m3 --name fallback --freeze-palette primary
python ../../packages/search/train/export.py --primary primary --fallback fallback --version v2
node scripts/search/emoji.ts                   # the emoji, read against the new vocabulary
node scripts/search/index.ts build             # the base snapshot, with the new palette vectors
```

Give every retrain a new version. The Worker's copy of the snapshot in R2 is named after the version, so the next deploy
starts from the new base, and a build never keeps vectors the old model measured. After the deploy settles, delete the
old version's file from the bucket.

To retrain only the text side (new phrases, new translations, another embedder), train with `--freeze-palette deployed`,
which reads the palette side from the shipped `tower.bin`. The palette vectors stay the same, though the collections'
vectors hold the text side's numbers, so the version and the base snapshot are new all the same.

A new model answers searches differently, and the search's tests hold the answers of this one: `src/tower.test.ts`
reads the new reference numbers, while the ranking fixtures in `apps/web/src/server/search/fixtures` and
`test/fixtures` need reading through and recording again.

A retrained text side moves the phrases. The collections read a title's word as a query's when the two phrases stand
close enough (`NAME_FLOOR`), so measure that closeness again: `node scripts/search/name-floor.ts` lists the pairs
around it.
