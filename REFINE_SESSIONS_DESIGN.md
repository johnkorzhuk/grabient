# Refine Sessions Design

## Problem

Currently, each "Refine" click is stateless—the LLM starts fresh with no memory of previous generations. This wastes the conversational nature of the AI and doesn't build on user feedback over multiple refinements.

## Solution Overview

```
User lands on /palettes/ocean
         │
         ▼
    [Refine] click ──────────────────────────────────┐
         │                                           │
         ▼                                           │
   Create session (v1)                               │
   Generate 24 palettes                              │
   LLM self-selects its top picks (by index)        │
   Store in session: generatedSeeds["1"], topPicks["1"]
         │                                           │
         ▼                                           │
   User gives feedback (thumbs up/down)              │
   Store in session: feedback["1"]                   │
         │                                           │
         ▼                                           │
    [Refine] click again ◄───────────────────────────┘
         │
         ▼
   Load session (now v2)
   Build SOFT context from:
     - llmTopPicks (from last version)
     - liked/disliked (from session feedback)
     - topPicks (from previous generation only)
   Generate 24 NEW palettes (prioritize uniqueness + query fit)
   Store in session: generatedSeeds["2"], topPicks["2"]
```

The "conversation" is implicit, built from:

1. LLM's self-selected top picks from **previous version only** (positive signal)
2. User likes from **previous version only** (positive signal)
3. User dislikes from **all versions** (negative signal—what to avoid)
4. Top picks from **previous generation only** (positive signal)

---

## LLM Self-Selection

Each generation, the LLM outputs palettes AND selects its top picks by index. These self-selected palettes become stronger context for the next generation.

### Output Format

```json
{
  "palettes": [
    ["#1a2b3c", "#4d5e6f", ...],
    ["#7a8b9c", "#0d1e2f", ...],
    ...
  ],
  "topPicks": [0, 5, 12, 18]
}
```

### System Prompt Addition

```
## Output Format
Return a JSON object with:
1. "palettes": array of ${limit} palette arrays (8 hex colors each)
2. "topPicks": array of 3-5 indices (0-based) of your strongest palettes for "${query}"

Select palettes that best capture the theme's essence with interesting color relationships.

Example:
{
  "palettes": [["#hex1", ...], ["#hex2", ...], ...],
  "topPicks": [0, 7, 15, 22]
}
```

### Using Top Picks in Next Generation

The LLM's self-selected palettes feed into the next refinement as the strongest context signal for continuation, alongside user feedback from thumbs up/down.

```typescript
interface RefineContext {
    llmTopPicks: string[][]; // LLM's self-selected from previous version (positive)
    liked: string[][]; // User likes from previous version (positive)
    disliked: string[][]; // User dislikes from all versions (negative)
    topPicks: string[][]; // Top picks from previous version (positive)
}
```

Priority hierarchy for context:

1. **LLM top picks** → "These worked well, explore similar directions"
2. **User liked** → "User approved these from last batch"
3. **User disliked** → "Avoid these directions"
4. **Top picks** → "Previous generation's strongest palettes"

---

## Database Schema

### New Table: `refine_sessions`

```sql
-- Migration: 0016_add_refine_sessions.sql
CREATE TABLE refine_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  query TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  generated_seeds TEXT NOT NULL DEFAULT '{}',
  top_picks TEXT NOT NULL DEFAULT '{}',
  feedback TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX refine_sessions_user_query_idx ON refine_sessions(user_id, query);
```

### Drizzle Schema

> **Docs**: [Drizzle ORM - Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)

```typescript
// packages/data-ops/src/drizzle/app-schema.ts

export const refineSessions = sqliteTable(
    "refine_sessions",
    {
        id: text("id").primaryKey(),
        userId: text("user_id"),
        query: text("query").notNull(),
        version: integer("version").notNull().default(1),
        // Seeds generated per version: { "1": ["seed1", "seed2"], "2": ["seed3"] }
        generatedSeeds: text("generated_seeds", { mode: "json" })
            .$type<Record<number, string[]>>()
            .notNull()
            .default({}),
        // LLM's self-selected top picks per version: { "1": [0, 5, 12], "2": [1, 8] }
        topPicks: text("top_picks", { mode: "json" })
            .$type<Record<number, number[]>>()
            .notNull()
            .default({}),
        // User feedback per version: { "1": { "seed1": "good", "seed2": "bad" }, "2": {...} }
        feedback: text("feedback", { mode: "json" })
            .$type<Record<number, Record<string, "good" | "bad">>>()
            .notNull()
            .default({}),
        createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    },
    (table) => ({
        userQueryIdx: index("refine_sessions_user_query_idx").on(
            table.userId,
            table.query,
        ),
    }),
);
```

**Two separate feedback systems**:
- `searchFeedback` table → feedback on vector DB search results (existing, unchanged)
- `refineSessions.feedback` → feedback on AI-generated palettes (per version, within session)

### Generating the Migration

> **Docs**: [Drizzle Kit Migrations](https://orm.drizzle.team/docs/migrations)

```bash
# Generate migration from schema changes
pnpm drizzle-kit generate

# Apply to local D1
pnpm drizzle-kit migrate

# Or push directly for rapid iteration
pnpm drizzle-kit push
```

---

## Server Implementation

### Building Refine Context

```typescript
// apps/user-application/src/server-functions/refine.ts

interface RefineContext {
    llmTopPicks: string[][]; // LLM's self-selected from previous version (positive)
    liked: string[][]; // User likes from previous version (positive)
    disliked: string[][]; // User dislikes from all versions (negative)
    topPicks: string[][]; // Top picks from previous version (positive)
}

async function buildRefineContext(
    session: RefineSession | null,
): Promise<RefineContext> {
    if (!session) {
        return { llmTopPicks: [], liked: [], disliked: [], topPicks: [] };
    }

    const prevVersion = session.version;

    // Get LLM's top picks from previous version
    const llmTopPicks = getVersionTopPicks(
        session.generatedSeeds,
        session.topPicks,
        prevVersion,
    );

    // Get user likes from previous version only (positive signal)
    const liked = getVersionLikedPalettes(
        session.feedback,
        prevVersion,
    );

    // Get user dislikes from ALL versions (negative signal)
    const disliked = getAllDislikedPalettes(session.feedback);

    // Get top picks from previous version (positive signal)
    const topPicks = getVersionTopPicks(
        session.generatedSeeds,
        session.topPicks,
        prevVersion,
    );

    return { llmTopPicks, liked, disliked, topPicks };
}

// Helper: get LLM's top picks from a specific version
function getVersionTopPicks(
    generatedSeeds: Record<number, string[]>,
    topPicks: Record<number, number[]>,
    version: number,
): string[][] {
    const seeds = generatedSeeds[version] ?? [];
    const picks = topPicks[version] ?? [];

    return picks
        .filter((idx) => idx >= 0 && idx < seeds.length)
        .map((idx) => seedToHexColors(seeds[idx]!));
}

// Helper: get liked palettes from a specific version
function getVersionLikedPalettes(
    feedback: Record<number, Record<string, "good" | "bad">>,
    version: number,
): string[][] {
    const versionFeedback = feedback[version] ?? {};
    return Object.entries(versionFeedback)
        .filter(([_, rating]) => rating === "good")
        .map(([seed]) => seedToHexColors(seed));
}

// Helper: get disliked palettes from ALL versions
function getAllDislikedPalettes(
    feedback: Record<number, Record<string, "good" | "bad">>,
): string[][] {
    const disliked: string[][] = [];

    for (const versionFeedback of Object.values(feedback)) {
        for (const [seed, rating] of Object.entries(versionFeedback)) {
            if (rating === "bad") {
                disliked.push(seedToHexColors(seed));
            }
        }
    }

    return disliked;
}

// Helper: get LLM's top picks from the last version
function getLastVersionTopPicks(
    generatedSeeds: Record<number, string[]>,
    topPicks: Record<number, number[]>,
    currentVersion: number,
): string[][] {
    const lastVersion = currentVersion; // topPicks from the version we just completed
    const seeds = generatedSeeds[lastVersion] ?? [];
    const picks = topPicks[lastVersion] ?? [];

    return picks
        .filter((idx) => idx >= 0 && idx < seeds.length)
        .map((idx) => seedToHexColors(seeds[idx]!));
}

// Helper: get most recent N palettes across versions
function getRecentPalettes(
    generatedSeeds: Record<number, string[]>,
    limit: number,
): string[][] {
    const versions = Object.keys(generatedSeeds)
        .map(Number)
        .sort((a, b) => b - a); // newest first

    const recent: string[][] = [];
    for (const version of versions) {
        const seeds = generatedSeeds[version] ?? [];
        for (const seed of seeds) {
            recent.push(seedToHexColors(seed));
            if (recent.length >= limit) return recent;
        }
    }
    return recent;
}
```

### System Prompt Integration

The session context is **soft guidance**, not hard constraints. The primary goal is always generating unique, interesting palettes that adhere to the query. As versions increase, the LLM naturally has less unexplored territory—that's okay. Some overlap is acceptable.

**Key principle**: Don't over-constrain. Only pass recent context, and frame it as guidance rather than rules.

```typescript
function buildSystemPrompt(
    query: string,
    limit: number,
    version: number,
    context: RefineContext,
): string {
    let prompt = `You are a color palette generator...`; // existing base prompt

    if (version > 1) {
        prompt += `\n\n## Session Context (Refinement #${version})
This is soft guidance to help you generate fresh variations. Your primary goal remains: unique, interesting palettes for "${query}".`;

        if (context.llmTopPicks.length > 0) {
            // LLM's own top picks from last version - positive signal
            prompt += `\n\n### Previous Top Picks (these worked well, explore similar directions)
${context.llmTopPicks
    .slice(0, 4)
    .map((p) => JSON.stringify(p))
    .join("\n")}`;
        }

        if (context.disliked.length > 0) {
            // User dislikes from all versions - negative signal
            prompt += `\n\n### User Disliked (avoid these directions)
${context.disliked
    .slice(0, 6)
    .map((p) => JSON.stringify(p))
    .join("\n")}`;
        }

        if (context.topPicks.length > 0) {
            prompt += `\n\n### Previous Top Picks (positive signal)
${context.topPicks
    .slice(0, 12)
    .map((p) => JSON.stringify(p))
    .join("\n")}`;
        }
    }

    return prompt;
}
```

### Updated Refine Function

> **Docs**: [TanStack AI - chat() function](https://tanstack.com/ai/latest/docs/reference/functions/chat)

The `chat()` function accepts a `messages` array representing conversation history. While we're not doing multi-turn chat, we build implicit context through the system prompt based on session state.

```typescript
export interface RefineRequest {
    query: string;
    limit?: number;
    sessionId?: string; // Continue existing session
    examples?: string[][];
    feedback?: PaletteFeedback;
}

export async function refinePalettesStream(
    request: RefineRequest,
    userId?: string,
): Promise<Response> {
    const { query, limit = 24, sessionId, examples, feedback } = request;
    const db = getDb();

    let session: RefineSession | null = null;
    let version = 1;

    // Load existing session if provided
    if (sessionId) {
        session = await db.query.refineSessions.findFirst({
            where: and(
                eq(refineSessions.id, sessionId),
                eq(refineSessions.query, normalizeQuery(query)),
            ),
        });

        if (session) {
            version = session.version + 1;
        }
    }

    // Create new session if needed
    const currentSessionId = session?.id ?? nanoid();
    if (!session) {
        await db.insert(refineSessions).values({
            id: currentSessionId,
            userId,
            query: normalizeQuery(query),
            version: 1,
            generatedSeeds: {},
            topPicks: {},
            feedback: {},
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    // Build context from session (feedback is stored in session, not separate table)
    const context = await buildRefineContext(session);
    const systemPrompt = buildSystemPrompt(query, limit, version, context);

    // ... streaming logic that parses JSON with palettes + topPicks ...

    // After stream completes, update session with new seeds and LLM's top picks
    const newSeeds: string[] = []; // collected during streaming
    const newTopPicks: number[] = []; // parsed from LLM's "topPicks" field

    await db
        .update(refineSessions)
        .set({
            version,
            generatedSeeds: {
                ...(session?.generatedSeeds ?? {}),
                [version]: newSeeds,
            },
            topPicks: {
                ...(session?.topPicks ?? {}),
                [version]: newTopPicks,
            },
            updatedAt: new Date(),
        })
        .where(eq(refineSessions.id, currentSessionId));
}
```

### Stream Protocol

**Important**: The current streaming UX must be preserved—palettes should appear on the client as they are generated, not after the full response completes.

Emit session metadata as the first event so the client can track the session:

```
data: {"type":"session","data":{"sessionId":"abc123","version":2}}

data: {"type":"palette","data":{"colors":["#1a2b3c",...]}}
data: {"type":"palette","data":{"colors":["#4d5e6f",...]}}
...
```

---

## API Route

> **Docs**: [TanStack Start - Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)

```typescript
// apps/user-application/src/routes/api/refine.ts

export const Route = createFileRoute("/api/refine")({
    server: {
        handlers: {
            POST: async ({ request }: { request: Request }) => {
                const body = (await request.json()) as RefineRequest;

                // Get userId from auth session if available
                const userId = await getCurrentUserId(request);

                return refinePalettesStream(body, userId);
            },
        },
    },
});
```

---

## Client Implementation

### Route State

```typescript
// apps/user-application/src/routes/palettes/$query.tsx

function SearchResultsPage() {
  // ... existing state

  // Track session across refinements
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedSeeds, setSelectedSeeds] = useState<Set<string>>(new Set());

  // Reset session when query changes
  const prevQuery = useRef(query);
  useEffect(() => {
    if (prevQuery.current !== query) {
      setSessionId(null);
      setSelectedSeeds(new Set());
      setRefinedPalettes([]);
      prevQuery.current = query;
    }
  }, [query]);

  // "Use n selected palettes" updates session
  const handleUseSelected = async () => {
    if (sessionId && selectedSeeds.size > 0) {
      await updateSessionSelections({
        sessionId,
        selectedSeeds: Array.from(selectedSeeds)
      });
    }
  };

  return (
    // ...
    <RefineButton
      query={query}
      sessionId={sessionId}
      onSessionCreated={setSessionId}
      // ... rest of props
    />
  );
}
```

### RefineButton Updates

```typescript
// apps/user-application/src/components/palettes/RefineButton.tsx

interface RefineButtonProps {
    // ... existing props
    sessionId?: string | null;
    onSessionCreated?: (sessionId: string) => void;
}

export function RefineButton({
    sessionId,
    onSessionCreated,
    // ...
}: RefineButtonProps) {
    const handleRefine = async () => {
        const body: RefineRequest = {
            query,
            limit,
            sessionId: sessionId ?? undefined,
        };

        const response = await fetch("/api/refine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        // Parse first event for session info
        // data: {"type":"session","data":{"sessionId":"abc123","version":2}}
        // Call onSessionCreated with the sessionId
    };
}
```

---

## Key Benefits

1. **Implicit Conversation**: The LLM sees what it generated before and produces complementary variations
2. **Feedback Loop**: Each refinement builds on thumbs up/down from previous rounds
3. **Selection Priority**: Explicitly selected palettes are treated as stronger signals
4. **Version Tracking**: Can analyze which version users prefer
5. **No Duplicate Work**: Avoids regenerating similar palettes across refinements
6. **No Fake Messages**: Context is structured data, not fabricated chat history

---

## Implementation Order

1. Add migration and Drizzle schema for `refine_sessions`
2. Update `refinePalettesStream` to load/create sessions
3. Update `buildSystemPrompt` to include session context
4. Update stream protocol to emit session metadata
5. Update `RefineButton` to handle sessionId
6. Update route state to track session and reset on query change
7. Add "Use selected" functionality to update session selections

---

## References

### TanStack

- [TanStack AI Overview](https://tanstack.com/ai/latest/docs)
- [TanStack AI - chat() API Reference](https://tanstack.com/ai/latest/docs/reference/functions/chat)
- [TanStack Start - Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start - Middleware](https://tanstack.com/start/latest/docs/framework/react/guide/middleware)

### Cloudflare

- [Cloudflare D1 - Community Projects](https://developers.cloudflare.com/d1/reference/community-projects/)

### Drizzle ORM

- [Drizzle ORM - Cloudflare D1](https://orm.drizzle.team/docs/connect-cloudflare-d1)
- [Drizzle ORM - D1 HTTP API with Drizzle Kit](https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit)
- [Drizzle ORM - Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle Kit Overview](https://orm.drizzle.team/docs/kit-overview)
