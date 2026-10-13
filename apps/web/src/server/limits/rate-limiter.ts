import { DurableObject } from "cloudflare:workers";

/** A stand-in for the limits' Durable Object, which cloudflare.config.ts exports: replaced when the limits arrive. */
export class RateLimiter extends DurableObject {}
