import type { Tool } from "../tool.ts";
import { collectionTools } from "./admin/collections.ts";
import { curationTools } from "./admin/curation.ts";
import { planTools } from "./admin/plans.ts";
import { publishTools } from "./admin/publish.ts";
import { readerTools } from "./admin/readers.ts";
import { reviewTools } from "./admin/reviews.ts";
import { tasteTools } from "./admin/taste.ts";
import { wordTools } from "./admin/words.ts";

/** The admins' tools, in the order an admin's connection lists them after the account's: what the admins liked and
    took out, Grabient's collections, what readers do, curation, words, publishing, plans and reviews. */
export const adminTools: readonly Tool[] = [
  ...tasteTools,
  ...collectionTools,
  ...readerTools,
  ...curationTools,
  ...wordTools,
  ...publishTools,
  ...planTools,
  ...reviewTools
];
