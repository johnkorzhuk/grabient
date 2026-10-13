/* Where the search tooling reads and writes, from this file's own place, so the steps run from any directory. */
import { resolve } from "node:path";

export const WEB = resolve(import.meta.dirname, "../..");
/** the training data and the Python steps */
export const TRAIN = resolve(WEB, "../../packages/search/train");
/** what the steps make and fetch: embeddings, features, weights and the site's export. Git ignores it. */
export const CACHE = resolve(TRAIN, "cache");
/** the model files and the shipped snapshot, served as static assets */
export const PUBLIC = resolve(WEB, "public/search");
