#!/usr/bin/env node
// Rotate the grabient-gsc-reader service-account key.
//
//   node scripts/rotate-gsc-key.mjs ~/Downloads/grabient-<new>.json
//
// Updates apps/admin/.dev.vars and the deployed grabient-admin Worker secret,
// then proves the new key works against Search Console and GA4.
//
// This file exists because the key has leaked into a session transcript twice,
// both times from an ad-hoc script that read .dev.vars and let an exception
// escape — Node prints the offending source line, and for a parse error that
// line IS the secret. So: nothing here ever writes key material to stdout, and
// every step that touches the file is wrapped so no exception can carry
// content out with it. Failures report a type, never a message.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_VARS = path.join(ADMIN_DIR, ".dev.vars");
const KEY = "GSC_SERVICE_ACCOUNT";

const fail = (step, err) => {
  // Deliberately not err.message — a JSON parse error embeds the input.
  console.error(`FAILED at ${step}: ${err?.constructor?.name ?? "Error"}`);
  process.exit(1);
};

const src = process.argv[2];
if (!src) fail("args", new Error());

// --- 1. read and validate the new key, printing only non-secret identifiers ---
let account, raw;
try {
  raw = fs.readFileSync(src.replace(/^~/, process.env.HOME ?? "~"), "utf8");
  account = JSON.parse(raw);
} catch (err) {
  fail("reading the downloaded key", err);
}
for (const field of ["type", "project_id", "client_email", "private_key", "private_key_id"]) {
  if (!account?.[field]) fail(`validating (${field} missing)`, new Error());
}
if (account.type !== "service_account") fail("validating (not a service account)", new Error());
console.log(`  key file:    ${account.client_email}`);
console.log(`  project:     ${account.project_id}`);
console.log(`  key id:      ${String(account.private_key_id).slice(0, 8)}…`);

// --- 2. prove it works BEFORE writing anything ---
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
  const jwt = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token ?? null;
}

const gsc = await mint("https://www.googleapis.com/auth/webmasters.readonly");
if (!gsc) fail("exchanging the new key for a token", new Error());
const sites = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
  headers: { Authorization: `Bearer ${gsc}` },
});
console.log(`  search console: HTTP ${sites.status}`);

const ga = await mint("https://www.googleapis.com/auth/analytics.readonly");
console.log(`  analytics:      ${ga ? "token OK" : "TOKEN FAILED"}`);

if (!sites.ok || !ga) fail("verifying the new key against Google", new Error());

// --- 3. write .dev.vars, backing up first ---
try {
  const current = fs.readFileSync(DEV_VARS, "utf8");
  fs.writeFileSync(`${DEV_VARS}.bak`, current, { mode: 0o600 });
  const line = `${KEY}='${JSON.stringify(account)}'`;
  const next = current.includes(`${KEY}=`)
    ? current.replace(new RegExp(`^${KEY}=.*$`, "m"), () => line)
    : `${current.replace(/\n*$/, "\n")}${line}\n`;
  fs.writeFileSync(DEV_VARS, next, { mode: 0o600 });
} catch (err) {
  fail("writing .dev.vars", err);
}
console.log("  .dev.vars:      updated (previous saved as .dev.vars.bak)");

// --- 4. push the Worker secret over stdin, never as an argument ---
try {
  execFileSync("npx", ["wrangler", "secret", "put", KEY], {
    cwd: ADMIN_DIR,
    input: JSON.stringify(account),
    stdio: ["pipe", "inherit", "inherit"],
  });
} catch (err) {
  fail("uploading the Worker secret", err);
}
console.log("\nDone. Now delete the OLD key in the GCP console — rotation is not");
console.log("complete until the old one is gone, and this new one is already live.");
