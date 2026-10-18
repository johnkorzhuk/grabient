import { LOCALES, localizePath } from "@grabient/i18n";

/** The crawlers that read for AI search, assistants and training, named so a zone rule that blocks them by default is
    answered in the file they read. */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "CCBot"
];
/** An account's own pages, in every language. Each is its word exactly, with or without a query: as a prefix, /saved
    would hide every collection whose address starts with the word. An account's own collections keep their prefix,
    which nothing else starts with. */
const ACCOUNT_PAGES = [
  "/saved$",
  "/saved?",
  "/settings$",
  "/settings?",
  "/unsubscribe$",
  "/unsubscribe?",
  "/unsubscribe/",
  "/collections/saved"
];
/** Random, which leads somewhere new each time, in every language and as its word exactly, and its pictures, of which
    every name draws another: no search crawler's to follow, while an agent a reader sends there (llms-full.txt) may. */
const RANDOM = [
  ...LOCALES.flatMap(l => ["/random$", "/random?"].map(path => localizePath(path, l))),
  "/random.png",
  "/random.svg"
].map(path => `Disallow: ${path}`);
/** What a page fetches for one visitor after it renders, and an account's own pages. Both groups list them, since a
    crawler reads only the group that names it (RFC 9309). */
const PRIVATE = [
  "/api/auth/",
  "/api/likes",
  "/api/like-info",
  "/api/like-counts",
  "/api/geo",
  "/api/settings/",
  "/cdn-cgi/",
  "/api/me/",
  "/api/search/layers",
  "/api/search-colors",
  // the authorization server's routes: an app's request, never a page
  "/oauth/",
  // the analytics beacon exactly: as a prefix /e would block /es and every collection whose address starts with e
  "/e$",
  "/e/",
  ...LOCALES.flatMap(l => ACCOUNT_PAGES.map(path => localizePath(path, l)))
].map(path => `Disallow: ${path}`);

/** robots.txt: the indexed deploy's, which names what crawlers skip, the sitemap and what agents read; every other
    deploy's refuses every crawler. */
export function robotsTxt(indexed: boolean, origin: string): string {
  if (!indexed) return "User-agent: *\nDisallow: /\n";
  return [
    "# Grabient welcomes search and AI crawlers.",
    "# Crawler access is also governed by Cloudflare AI Crawl Control: both must allow a bot.",
    "",
    "User-agent: *",
    "# What a page fetches for one visitor after it renders. None of it changes what the page says,",
    "# and a crawler that renders pages would spend its visits here instead of on palettes.",
    ...PRIVATE,
    ...RANDOM,
    // the gallery's lists as JSON are a page's own fetch too; llms.txt gives them to the agents named below
    "Disallow: /api/palettes",
    "",
    "# AI search, assistant and training crawlers, by name: the pages, the Markdown pages and the routes llms.txt gives are",
    "# theirs to read. A crawler reads only the group that names it, so this one repeats the lines above but Random and",
    "# the lists' JSON.",
    ...AI_CRAWLERS.map(agent => `User-agent: ${agent}`),
    ...PRIVATE,
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
    `# Guide for AI agents: ${origin}/llms.txt (the whole reference: ${origin}/llms-full.txt)`,
    `# What agents can call: ${origin}/.well-known/ai-catalog.json and the MCP server at ${origin}/mcp`,
    "# Any palette or collection page as Markdown: add .md to its address. A palette as data: .json. As an image: .png or .svg.",
    ""
  ].join("\n");
}
