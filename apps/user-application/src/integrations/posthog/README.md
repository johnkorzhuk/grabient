# PostHog GDPR-Compliant Integration

This integration connects PostHog analytics with the consent store to ensure GDPR compliance.

## Overview

PostHog is initialized with privacy-first defaults and only starts tracking when the user explicitly opts in through the consent banner.

**Important**: PostHog is **disabled in development mode** to avoid polluting analytics data. It only runs in production builds.

## Configuration

### Environment Variables

Located in `.env`:
```env
VITE_POSTHOG_API_KEY=phc_YtRERLNG3jXUoOisN6NXQS9sI5Iz0gAUkiY7nX7puTK
VITE_POSTHOG_API_HOST=https://us.i.posthog.com
```

These are safe to commit as they're public client-side keys.

### Graceful Degradation

PostHog will gracefully skip initialization if:
- Running in development mode (`import.meta.env.DEV`)
- `VITE_POSTHOG_API_KEY` is not provided

In both cases, a console message is logged and the app continues to function normally without analytics.

## Privacy Settings

### Default Behavior (No Consent)
- `opt_out_capturing_by_default: true` - No tracking until user opts in
- `disable_session_recording: true` - Session replay disabled by default
- `person_profiles: "identified_only"` - Only create profiles for logged-in users
- `persistence: "memory"` - No cookies or localStorage until consent is given

### Session Recording Privacy
When session replay is enabled:
- `maskAllInputs: true` - All input fields are masked
- `maskTextSelector: "*"` - All text content is masked
- `blockClass: "ph-no-capture"` - Elements with this class are blocked

### Data Collection
- `capture_pageview: false` - Manual pageview tracking (prevents auto-tracking before consent)
- `respect_dnt: true` - Respects browser Do Not Track settings
- `autocapture` - Limited to clicks on buttons and links only

## Consent Integration

The integration watches the consent store and updates PostHog in real-time:

### Analytics Consent (`consent.categories.analytics`)

**When `false` (default)**:
- PostHog is initialized but opted out
- No events are captured
- No user data is collected
- Persistence is set to `"memory"` (no cookies, no localStorage)

**When `true`**:
- Persistence switches to `"localStorage+cookie"` for tracking across sessions
- Calls `posthog.opt_in_capturing()`
- Starts capturing events and pageviews
- Creates user profiles for identified users

### Session Replay Consent (`consent.categories.sessionReplay`)

**Dependency**: Requires `analytics=true` to work

**When `false`**:
- Session recording is stopped
- No replay data is captured

**When `true` AND `analytics=true`**:
- Calls `posthog.startSessionRecording()`
- Captures privacy-protected session replays
- All sensitive data is masked

## Runtime Consent Changes

Users can toggle consent in settings without page refresh:

1. **Analytics enabled** → Persistence switches to `"localStorage+cookie"`, then `opt_in_capturing()` is called
2. **Analytics disabled** → Persistence switches to `"memory"`, then `opt_out_capturing()` is called (cookies/localStorage cleared)
3. **Session replay enabled** (requires analytics) → `startSessionRecording()` is called
4. **Session replay disabled** → `stopSessionRecording()` is called

### Edge Case Handling

- **Rapid toggles**: Uses React's effect dependency array to prevent duplicate calls
- **PostHog not loaded**: Guards check `posthog.__loaded` before making calls
- **Analytics off, replay on**: Replay automatically stops when analytics is disabled
- **SSR**: All PostHog code is guarded with `typeof window !== "undefined"`

## File Structure

```
src/integrations/posthog/
├── posthogConfig.ts          # PostHog initialization with privacy settings
├── useInitializePostHog.ts   # React hook that syncs PostHog with consent store
├── index.ts                  # Public exports
└── README.md                 # This file
```

## Integration Points

### Root Route (`src/routes/__root.tsx`)

```tsx
import { useInitializePostHog } from "@/integrations/posthog/useInitializePostHog";

function PostHogInitializer() {
    useInitializePostHog();
    return null;
}

// Used in RootComponent:
<ThemeProvider>
    <SentryInitializer />
    <PostHogInitializer />
    {/* ... */}
</ThemeProvider>
```

## Development

PostHog is **disabled in development mode** to prevent polluting production analytics data. You'll see this message in the console:

```
PostHog disabled in development mode
```

To test PostHog in development:
1. Build the app for production: `pnpm build`
2. Preview the production build: `pnpm serve`
3. PostHog will initialize and log: `PostHog initialized: { distinctId: "...", sessionId: "...", optedOut: true }`

## Manual Tracking

To manually track events in your components:

```tsx
import { getPostHogInstance, isPostHogInitialized } from "@/integrations/posthog";

function MyComponent() {
    const handleClick = () => {
        if (!isPostHogInitialized()) {
            return;
        }

        const posthog = getPostHogInstance();
        if (posthog.__loaded && !posthog.has_opted_out_capturing()) {
            posthog.capture("button_clicked", {
                button_name: "subscribe",
            });
        }
    };

    return <button onClick={handleClick}>Subscribe</button>;
}
```

**Note**: Always check `isPostHogInitialized()` first to ensure PostHog is available (it won't be in development mode).

## Compliance Notes

- ✅ **GDPR Compliant**: Opt-out by default, requires explicit consent
- ✅ **No Cookies Without Consent**: Cookies and localStorage only enabled when user consents
- ✅ **Privacy-Preserving**: All sensitive data is masked in session replays
- ✅ **Transparent**: User has full control through consent settings
- ✅ **Respect DNT**: Browser Do Not Track settings are respected
- ✅ **Data Minimization**: Only collects necessary analytics data
- ✅ **Right to Withdraw**: Users can revoke consent at any time (persistence switched back to memory)

## Migration to EU Cloud (Optional)

To use EU Cloud for data residency:

1. Create a new project at https://eu.posthog.com
2. Get the new API key
3. Update `.env`:
   ```env
   VITE_POSTHOG_API_KEY=phc_<new_eu_key>
   VITE_POSTHOG_API_HOST=https://eu.i.posthog.com
   ```

No code changes required!
