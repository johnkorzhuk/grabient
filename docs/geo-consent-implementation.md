# Geo-Based Consent Management Implementation Guide

This document outlines how to implement geo-based consent management for Grabient, using Cloudflare Workers to detect user location and automatically set appropriate consent defaults for Google Ads/AdSense.

## Goal

- **Non-EEA users**: Auto-grant ad consent (personalized ads, no banner needed)
- **EEA/UK/CH users**: Keep ad consent denied (non-personalized ads, no banner needed - users can opt-in via Settings)

## Current State

Grabient already has:
- Google Consent Mode v2 implemented in `apps/user-application/src/integrations/ga4/ga4Config.ts`
- A consent store in `apps/user-application/src/stores/consent-store.ts`
- Consent UI in `apps/user-application/src/components/settings/ConsentSection.tsx`
- Currently defaults ALL consent (including ads) to `denied` for everyone

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ User Request → Cloudflare Edge                       │
└──────────────────────┬──────────────────────────────┘
                       │
       ┌───────────────▼───────────────┐
       │ Cloudflare Worker             │
       │ - Read request.cf.country     │
       │ - Read request.cf.isEUCountry │
       │ - Inject geo data into app    │
       └───────────┬───────────────────┘
                   │
    ┌──────────────▼──────────────────────┐
    │ Client-Side                          │
    │ - Read geo data                      │
    │ - Set consent defaults based on geo  │
    │ - EEA: ad consent = denied           │
    │ - Non-EEA: ad consent = granted      │
    └──────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Add Advertising Consent Category

Update `apps/user-application/src/stores/consent-store.ts`:

```typescript
const consentCategoriesSchema = v.object({
    necessary: v.literal(true),
    analytics: v.boolean(),
    sessionReplay: v.boolean(),
    advertising: v.boolean(),  // NEW
});

const defaultConsentState: ConsentState = {
    version: CONSENT_VERSION,  // Increment this!
    timestamp: Date.now(),
    categories: {
        necessary: true,
        analytics: false,
        sessionReplay: false,
        advertising: false,  // NEW - defaults to false
    },
    hasInteracted: false,
};
```

### Step 2: Create Geo Store

Create `apps/user-application/src/stores/geo-store.ts`:

```typescript
import { Store } from "@tanstack/react-store";

export interface GeoState {
    country: string | null;
    isEEA: boolean;
    isLoaded: boolean;
}

const defaultGeoState: GeoState = {
    country: null,
    isEEA: true,  // Default to EEA (safer - requires consent)
    isLoaded: false,
};

export const geoStore = new Store<GeoState>(defaultGeoState);

export function setGeoData(country: string, isEEA: boolean) {
    geoStore.setState(() => ({
        country,
        isEEA,
        isLoaded: true,
    }));
}
```

### Step 3: Define EEA Country List

Create `apps/user-application/src/lib/geo-constants.ts`:

```typescript
// EEA = EU (27) + Iceland, Liechtenstein, Norway
// Plus UK and Switzerland which have similar requirements
export const CONSENT_REQUIRED_COUNTRIES = new Set([
    // EU Member States (27)
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',

    // EEA Non-EU (3)
    'IS', 'LI', 'NO',

    // Additional (similar requirements)
    'GB',  // UK - has UK GDPR
    'CH',  // Switzerland - has similar privacy laws

    // Fallback for some GeoIP services
    'EU',
]);

export function isConsentRequiredCountry(countryCode: string | null): boolean {
    if (!countryCode) return true;  // Assume EEA if unknown (safer)
    return CONSENT_REQUIRED_COUNTRIES.has(countryCode.toUpperCase());
}
```

### Step 4: Pass Geo Data from Server to Client

Grabient uses TanStack Start with Cloudflare Workers. The geo data is available via `request.cf`.

**Option A: Via Server Function (Recommended)**

Create `apps/user-application/src/server-functions/geo.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start/server";
import { getWebRequest } from "@tanstack/react-start/server";
import { isConsentRequiredCountry } from "@/lib/geo-constants";

export const getGeoData = createServerFn({ method: "GET" }).handler(async () => {
    const request = getWebRequest();

    // Cloudflare Workers provide geo data via request.cf
    const cf = (request as any).cf || {};
    const country = cf.country || null;
    const isEUCountry = cf.isEUCountry === true;

    // Use both Cloudflare's isEUCountry and our own list for safety
    const isEEA = isEUCountry || isConsentRequiredCountry(country);

    return {
        country,
        isEEA,
    };
});
```

**Option B: Via Middleware/Loader**

Add to root route loader in `apps/user-application/src/routes/__root.tsx`:

```typescript
export const Route = createRootRouteWithContext<{
    queryClient: QueryClient;
}>()({
    loader: async ({ context }) => {
        // This runs on the server
        const request = getWebRequest();
        const cf = (request as any).cf || {};

        return {
            geo: {
                country: cf.country || null,
                isEEA: cf.isEUCountry || isConsentRequiredCountry(cf.country),
            },
        };
    },
    // ... rest of config
});
```

### Step 5: Initialize Geo-Based Consent on Client

Create `apps/user-application/src/hooks/useGeoConsent.ts`:

```typescript
import { useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { geoStore, setGeoData } from "@/stores/geo-store";
import { consentStore, updateConsent } from "@/stores/consent-store";
import { getGeoData } from "@/server-functions/geo";
import { isConsentRequiredCountry } from "@/lib/geo-constants";

export function useGeoConsent() {
    const hasInitialized = useRef(false);
    const consent = useStore(consentStore);
    const geo = useStore(geoStore);

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        async function initGeoConsent() {
            try {
                const geoData = await getGeoData();
                setGeoData(geoData.country, geoData.isEEA);

                // Only auto-grant advertising consent if:
                // 1. User is NOT in EEA
                // 2. User has NOT already interacted with consent settings
                if (!geoData.isEEA && !consent.hasInteracted) {
                    updateConsent({ advertising: true });
                }
            } catch (error) {
                console.error("Failed to load geo data:", error);
                // On error, assume EEA (safer)
                setGeoData(null, true);
            }
        }

        initGeoConsent();
    }, [consent.hasInteracted]);

    return geo;
}
```

### Step 6: Update GA4 Config to Use Advertising Consent

Update `apps/user-application/src/integrations/ga4/ga4Config.ts`:

```typescript
export function updateGA4Consent(
    analyticsConsent: boolean,
    advertisingConsent: boolean  // NEW parameter
): void {
    if (!ga4Initialized) return;
    if (typeof window === "undefined" || !window.gtag) return;

    window.gtag("consent", "update", {
        analytics_storage: analyticsConsent ? "granted" : "denied",
        ad_storage: advertisingConsent ? "granted" : "denied",
        ad_user_data: advertisingConsent ? "granted" : "denied",
        ad_personalization: advertisingConsent ? "granted" : "denied",
    });
}
```

### Step 7: Connect Everything in Root Component

Update `apps/user-application/src/routes/__root.tsx`:

```typescript
import { useGeoConsent } from "@/hooks/useGeoConsent";

function GeoConsentInitializer() {
    useGeoConsent();
    return null;
}

function RootComponent() {
    // ... existing code ...

    return (
        <RootDocument>
            <ThemeProvider>
                <GeoConsentInitializer />  {/* NEW */}
                <SentryInitializer />
                <PostHogInitializer />
                <GA4Initializer />
                {/* ... rest */}
            </ThemeProvider>
        </RootDocument>
    );
}
```

### Step 8: Update GA4 Initializer

Update `apps/user-application/src/integrations/ga4/useInitializeGA4.ts` to pass advertising consent:

```typescript
import { useStore } from "@tanstack/react-store";
import { consentStore } from "@/stores/consent-store";
import { updateGA4Consent } from "./ga4Config";

export function useInitializeGA4() {
    const consent = useStore(consentStore);

    useEffect(() => {
        updateGA4Consent(
            consent.categories.analytics,
            consent.categories.advertising  // NEW
        );
    }, [consent.categories.analytics, consent.categories.advertising]);

    // ... rest of hook
}
```

### Step 9: Add Advertising Toggle to Settings (Optional)

Update `apps/user-application/src/components/settings/ConsentSection.tsx`:

```tsx
<ConsentToggle
    id="consent-advertising"
    label="Personalized Advertising"
    description="Allow personalized ads based on your interests. Only applicable in regions that allow this."
    checked={consentState.categories.advertising}
    onChange={(checked) => handleCategoryChange("advertising", checked)}
/>
```

---

## Cloudflare Worker Request Object Reference

When running on Cloudflare Workers, `request.cf` contains:

```typescript
interface CfProperties {
    country: string;         // 2-letter ISO 3166-1 Alpha 2 (e.g., "US", "DE")
    city?: string;           // City name
    continent?: string;      // Continent code
    region?: string;         // Region/state name
    regionCode?: string;     // Region code (Business plan+)
    postalCode?: string;     // Postal code
    latitude?: string;       // Latitude
    longitude?: string;      // Longitude
    timezone?: string;       // Timezone (e.g., "America/New_York")
    isEUCountry?: boolean;   // True if EU member state
}
```

---

## Testing

### Local Development

In development, `request.cf` won't be available. Add a fallback:

```typescript
// In geo server function
const cf = (request as any).cf || {
    country: process.env.DEV_GEO_COUNTRY || 'US',
    isEUCountry: process.env.DEV_GEO_IS_EU === 'true',
};
```

Set in `.dev.vars`:
```
DEV_GEO_COUNTRY=DE
DEV_GEO_IS_EU=true
```

### Testing Different Regions

1. Use browser DevTools to test with different geo values
2. Set up a simple test endpoint that returns current geo data
3. Use VPN to test from actual different locations

---

## Important Compliance Notes

### What This Achieves

| User Location | Ad Consent Default | Ads Shown | Banner Needed |
|--------------|-------------------|-----------|---------------|
| Non-EEA (US, etc.) | `granted` | Personalized | No |
| EEA/UK/CH | `denied` | Non-personalized | No |
| EEA user opts in via Settings | `granted` | Personalized | No (user chose) |

### Why No Banner is Needed

1. **Non-EEA users**: GDPR doesn't apply, consent not required
2. **EEA users**: We default to `denied`, serving only non-personalized ads which don't require explicit consent for the ads themselves (though we still respect any local cookie laws)

### Revenue Impact

- EEA users with non-personalized ads typically generate 50-70% of personalized ad revenue
- This is the trade-off for not showing consent banners
- Users can opt-in via Settings to get personalized ads if they choose

### Google's Requirements Met

- Consent Mode v2 implemented ✓
- `ad_storage`, `ad_user_data`, `ad_personalization` all properly set ✓
- Default to `denied` for EEA ✓
- Proper consent update mechanism ✓

---

## References

### Official Documentation
- [Google Consent Mode v2 Setup](https://developers.google.com/tag-platform/security/guides/consent)
- [Google Ads Consent Mode v2 Reference](https://support.google.com/google-ads/answer/13802165)
- [Cloudflare Workers Geolocation](https://developers.cloudflare.com/workers/examples/geolocation-hello-world/)
- [Cloudflare Zaraz: Consent Mode](https://developers.cloudflare.com/zaraz/advanced/google-consent-mode/)

### Open Source CMPs (for reference)
- [Osano CookieConsent](https://github.com/osano/cookieconsent) - Most popular, built-in geo
- [Orestbida CookieConsent](https://github.com/orestbida/cookieconsent) - Lightweight, MIT licensed
- [Silktide Consent Manager](https://silktide.com/consent-manager/) - Free, Google Consent Mode v2 native
- [Tarteaucitron](https://tarteaucitron.io/en/) - French CMP, Google Consent Mode v2 native
- [Klaro](https://github.com/kiprotect/klaro) - Open source, GDPR compliant

### Country Lists
- [GDPR Countries List](https://thoropass.com/blog/compliance/gdpr-countries/)
- [EU User Consent Policy - Google](https://support.google.com/adsense/answer/7670013)

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/stores/consent-store.ts` | Modify | Add `advertising` category |
| `src/stores/geo-store.ts` | Create | New store for geo data |
| `src/lib/geo-constants.ts` | Create | EEA country list |
| `src/server-functions/geo.ts` | Create | Server function to get geo data |
| `src/hooks/useGeoConsent.ts` | Create | Hook to initialize geo-based consent |
| `src/integrations/ga4/ga4Config.ts` | Modify | Accept advertising consent param |
| `src/integrations/ga4/useInitializeGA4.ts` | Modify | Pass advertising consent |
| `src/routes/__root.tsx` | Modify | Add GeoConsentInitializer |
| `src/components/settings/ConsentSection.tsx` | Modify | Add advertising toggle (optional) |
