import { t } from "@grabient/i18n";
import type { CollectionSummary } from "./types.ts";

/* What a collection's pages say beside what every list says (features/gallery/drawing.ts): who made a collection. */

/** Who made a collection, as a page names them: Grabient for an agent's (its name for an admin), an account by its
    display name, else @username. Never an account's id. */
export const ownerLabel = (owner: CollectionSummary["owner"], admin = false): string =>
  owner.kind === "agent"
    ? admin
      ? t("{name} (agent)", { name: owner.name ?? t("agent") })
      : "Grabient"
    : owner.display || (owner.name ? `@${owner.name}` : t("Grabient user"));
