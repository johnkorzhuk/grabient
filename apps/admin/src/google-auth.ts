// Service-account access tokens for Google APIs.
//
// Extracted from search-console.ts when GA4 became a second consumer: the JWT
// assertion flow is identical for every Google API, only the scope differs, and
// two copies of an RSA signing path is one too many.
//
// Two-legged OAuth: sign a JWT assertion with the account's RSA key, POST it to
// Google's token endpoint, get a bearer token back. No user interaction, no
// refresh token to keep alive.

import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
      console.error("GSC_SERVICE_ACCOUNT is missing client_email or private_key");
      return null;
    }
    return parsed as ServiceAccount;
  } catch {
    console.error("GSC_SERVICE_ACCOUNT is not valid JSON");
    return null;
  }
}

// Access tokens last an hour; re-minting one per dashboard load would mean an
// RSA signature and a round trip to Google on every page view. Keyed by scope
// because a Search Console token is not valid for the Analytics Data API.
const tokenCache = new Map<string, { expiresAt: number; token: string }>();

export async function accessToken(
  account: ServiceAccount,
  scope: string,
  now: Date,
): Promise<string | null> {
  const cached = tokenCache.get(scope);
  if (cached && now.getTime() < cached.expiresAt - 60_000) return cached.token;

  let assertion: string;
  try {
    // The JSON key stores the PEM with escaped newlines when it has been through
    // an env var; restore them or importPKCS8 rejects the key.
    const pem = account.private_key.replace(/\\n/g, "\n");
    const key = await importPKCS8(pem, "RS256");
    assertion = await new SignJWT({ scope })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(account.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 3600)
      .sign(key);
  } catch (err) {
    console.error("Google assertion signing failed", err);
    return null;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const payload: any = await res.json();
    if (!res.ok || !payload?.access_token) {
      console.error(
        `Google token exchange failed (${res.status})`,
        JSON.stringify(payload).slice(0, 200),
      );
      return null;
    }
    tokenCache.set(scope, {
      token: payload.access_token,
      expiresAt: now.getTime() + (payload.expires_in ?? 3600) * 1000,
    });
    return payload.access_token as string;
  } catch (err) {
    console.error("Google token exchange threw", err);
    return null;
  }
}

export const SCOPE_SEARCH_CONSOLE = "https://www.googleapis.com/auth/webmasters.readonly";
export const SCOPE_ANALYTICS = "https://www.googleapis.com/auth/analytics.readonly";
