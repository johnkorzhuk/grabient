#!/usr/bin/env node
// Prove the key currently in .dev.vars still authenticates.
//
//   node scripts/verify-gsc-key.mjs
//
// Same output discipline as rotate-gsc-key.mjs: no key material reaches stdout,
// and failures report an error type rather than a message, because a JSON parse
// error embeds its input.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DEV_VARS = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  ".dev.vars",
);

let account;
try {
  const line = fs
    .readFileSync(DEV_VARS, "utf8")
    .split("\n")
    .find((l) => l.startsWith("GSC_SERVICE_ACCOUNT="));
  let value = line.slice("GSC_SERVICE_ACCOUNT=".length).trim();
  if (/^['"]/.test(value)) value = value.slice(1, -1);
  account = JSON.parse(value);
} catch (err) {
  console.error(`could not read the key: ${err?.constructor?.name ?? "Error"}`);
  process.exit(1);
}

console.log(`  key in .dev.vars: ${String(account.private_key_id).slice(0, 8)}…`);
console.log(`  identity:         ${account.client_email}`);

async function mint(scope) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: account.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signer.sign(account.private_key, "base64url")}`,
    }),
  });
  return res.ok ? (await res.json()).access_token : null;
}

const gsc = await mint("https://www.googleapis.com/auth/webmasters.readonly");
if (!gsc) {
  console.error("\n  TOKEN REFUSED — this key has been revoked or disabled.");
  process.exit(1);
}
const sites = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
  headers: { Authorization: `Bearer ${gsc}` },
});
const body = sites.ok ? await sites.json() : null;
console.log(`  search console:   HTTP ${sites.status}`);
for (const s of body?.siteEntry ?? [])
  console.log(`      ${s.permissionLevel.padEnd(16)} ${s.siteUrl}`);

const ga = await mint("https://www.googleapis.com/auth/analytics.readonly");
console.log(`  analytics:        ${ga ? "token OK" : "TOKEN REFUSED"}`);
console.log(`\n  ${sites.ok && ga ? "Key is live and working." : "KEY IS NOT WORKING."}`);
process.exit(sites.ok && ga ? 0 : 1);
