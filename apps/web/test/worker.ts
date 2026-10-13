/* The tests' Worker entry in place of src/server.ts: it exports the class the RATE_LIMITER binding names, and serves
   nothing itself. The tests call the server modules directly. */

export { RateLimiter } from "../src/server/limits/rate-limiter.ts";

export default {
  fetch: () => new Response(null, { status: 404 })
};
