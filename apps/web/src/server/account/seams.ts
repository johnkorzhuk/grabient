import type { Env } from "@grabient/server/env.ts";

/* What the account's routes take from the areas around them, each under the name its spec gives it. These stand in
   until those areas land; the account's routes call nothing of theirs but through here. */

/** Stands in for the connected apps' forgetting of a deleted account (U09, `forgetAccount`): every grant its apps
    hold revoked. Their tokens already fail, since the validator finds no account. */
export async function forgetConnections(
  _env: Env,
  _origin: string,
  _userId: string
): Promise<void> {}
