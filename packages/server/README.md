# @grabient/server

What every Worker on Grabient's database shares: the D1 helpers and migrations, sign-in (Better Auth), rate limits and
the `RateLimiter` Durable Object, feature flags, usage counts and the email sending seam. It imports nothing from an
app, Solid or the browser. A Worker imports its modules by path, `@grabient/server/auth/gate.ts`, and exports
`RateLimiter` from its entry.

## Migrations

`migrations/` holds the D1 schema. `0000_baseline` creates the oldest tables where they are missing, so it changes
nothing on production's database. `0022` to `0054` are applied to live databases and never change. A new migration
takes the next number and only adds; a table is dropped only once no deployed version reads it.
