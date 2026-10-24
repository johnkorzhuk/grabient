/* Search engines, link previews and AI crawlers, by User-Agent. A crawler is never sent to another language, and a
   search answers it without buying a model read. Any request may claim one of these names and gets the same page.
   Agents fetching a page for a person right now (ChatGPT-User, Claude-User, Perplexity-User) are not crawlers: an
   empty answer would tell that person nothing matches. */
const CRAWLER =
  /Googlebot|Google-InspectionTool|GoogleOther|AdsBot-Google|Mediapartners-Google|Storebot-Google|Google-Extended|bingbot|BingPreview|msnbot|adidxbot|DuckDuckBot|Applebot|Yandex|Yeti|Daum|coccocbot|Baiduspider|PetalBot|SeznamBot|Sogou|Qwantify|Exabot|facebookexternalhit|meta-externalagent|meta-externalfetcher|meta-webindexer|Twitterbot|Slackbot|Discordbot|LinkedInBot|TelegramBot|WhatsApp|Pinterestbot|redditbot|Iframely|Embedly|SkypeUriPreview|GPTBot|OAI-SearchBot|ClaudeBot|Claude-SearchBot|anthropic-ai|PerplexityBot|CCBot|Bytespider|Amazonbot|cohere-ai|Diffbot|SemrushBot|AhrefsBot|MJ12bot|DotBot|DataForSeoBot|ia_archiver|archive\.org_bot/i;

export const isCrawler = (request: Request): boolean =>
  CRAWLER.test(request.headers.get("User-Agent") ?? "");

/* The apps that draw a preview of a link someone posts: X, Facebook and iMessage, Slack, Discord, LinkedIn, Telegram,
   WhatsApp, Reddit, Pinterest, Teams and Skype, Mastodon, Bluesky and the embed services. */
const LINK_PREVIEW =
  /Twitterbot|facebookexternalhit|Facebot|Slackbot|Discordbot|LinkedInBot|TelegramBot|WhatsApp|redditbot|Pinterestbot|SkypeUriPreview|Mastodon|Cardyb|Iframely|Embedly/i;

export const isLinkPreview = (request: Request): boolean =>
  LINK_PREVIEW.test(request.headers.get("User-Agent") ?? "");
