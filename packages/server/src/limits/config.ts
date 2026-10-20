/* Every limit: how many requests it allows in its window of seconds.
   - site: a ceiling for the whole site, counted under one fixed key. An isolate that has seen it refused refuses at
     once, before asking anyone.
   - local: counted in each isolate alone and never asked of the Durable Object. It stops one client's burst for
     nothing, while the durable limits beside it hold across isolates.
   - work: liking and making. On staging, where contributors and their agents work before it reaches production, an
     admin's check is `scaled` and allows STAGING_WORK_SCALE times as much (writes.ts workChecks).
   - lease: taken from the Durable Object in blocks of one, then twice the last, up to this many. An isolate asks once
     per block, and the limit can refuse early by at most the blocks isolates hold unspent.
   - kept: an isolate's own count that must last its window, remembered apart from the burst counts that come and go. */

export interface Limit {
  requests: number;
  window: number;
  site?: true;
  local?: true;
  work?: true;
  lease?: number;
  kept?: true;
}

export const LIMITS = {
  // An account's hearts and the site's day. A like of a palette the gallery lacks adds it there, so these also bound how
  // many palettes join the gallery. An app's save counts against the account like a heart, then against the apps' day.
  toggleLike: { requests: 20, window: 60, local: true, work: true },
  toggleLikeDaily: { requests: 1000, window: 86400, work: true, lease: 8 },
  likesDaily: { requests: 20000, window: 86400, site: true, work: true, lease: 20 },
  mcpLikesDaily: { requests: 5000, window: 86400, site: true, work: true, lease: 10 },
  // An app's saves of palettes new to the site join the public gallery unreviewed: fifty a day, staging included.
  mcpPublishDaily: { requests: 50, window: 86400 },
  contactForm: { requests: 5, window: 600 },
  // Email Service bills per message past the month's allowance. Each kind of email has the site's hour and day, each
  // inbox a few a day, and each address asking a few in ten minutes. Deletion mail counts apart from sign-in, so a
  // flood of sign-in requests never stops an account from being deleted.
  magicLinkGlobal: { requests: 50, window: 3600, site: true },
  magicLinkDaily: { requests: 300, window: 86400, site: true },
  deletionEmail: { requests: 50, window: 86400, site: true },
  emailRecipient: { requests: 6, window: 86400 },
  emailAsk: { requests: 5, window: 600 },
  contactGlobal: { requests: 20, window: 3600, site: true },
  contactDaily: { requests: 50, window: 86400, site: true },
  // The newsletter bills per email through Resend. An account's own choice and a link subscribing again are counted in
  // the isolate alone, so the newsletter can be ended while the Durable Object cannot answer.
  newsletterDaily: { requests: 5000, window: 86400, site: true },
  newsletterTest: { requests: 5, window: 3600 },
  newsletterChoice: { requests: 60, window: 60, local: true },
  newsletterBack: { requests: 10, window: 3600, local: true },
  // Sign-in with Google, a code and signing out write nothing before a sign-in completes, so the isolate counts them.
  authPost: { requests: 30, window: 60, local: true },
  // The session check, a sign-in link opened, Google's way back.
  authRead: { requests: 120, window: 60, local: true },
  // The app reviewers' password sign-in: each try for their address hashes a password.
  passwordSignIn: { requests: 10, window: 600 },
  passwordSignInDaily: { requests: 500, window: 86400, site: true },
  // The account search, per account and for the site's day of paid work.
  searchAccount: { requests: 30, window: 60 },
  searchAccountDaily: { requests: 1000, window: 86400 },
  searchBudget: { requests: 20000, window: 86400, site: true, lease: 20 },
  // Search words the vocabulary does not know cost an embedding each, per address (per account for an app) and for
  // the day; apps have a day of their own, so they never spend the visitors'.
  searchModel: { requests: 20, window: 60, local: true },
  searchModelDaily: { requests: 300, window: 86400, lease: 4 },
  searchModelBudget: { requests: 20000, window: 86400, site: true, lease: 20 },
  searchModelApps: { requests: 5000, window: 86400, site: true, lease: 20 },
  // A picture no cache held, per address and for the site's day; a large one costs several times as much.
  imageRender: { requests: 60, window: 60, local: true },
  imageRenderDaily: { requests: 20000, window: 86400, site: true, lease: 20 },
  largeImageDaily: { requests: 2000, window: 86400, site: true, lease: 5 },
  avatarUpload: { requests: 10, window: 3600 },
  avatarUploadDaily: { requests: 500, window: 86400, site: true },
  usernameCheck: { requests: 120, window: 3600 },
  usernameWrite: { requests: 10, window: 3600 },
  // Llama and Clef judging a name as it is saved and before it is shown on palettes, about eleven Workers AI neurons
  // each, per account by the hour and the day and for the site's day, which stays a few cents however it is pressed.
  usernameScreen: { requests: 10, window: 3600 },
  usernameScreenAccountDaily: { requests: 20, window: 86400 },
  usernameScreenDaily: { requests: 2000, window: 86400, site: true, lease: 5 },
  // Settings' switch for that name, which reads and writes a row
  creditChoice: { requests: 60, window: 60, local: true },
  // A client document Grabient keeps no copy of: the Worker fetches it from wherever its address points.
  cimdFetch: { requests: 20, window: 60, local: true },
  // An app registering itself writes a client, kept a year, for anyone who asks.
  oauthRegister: { requests: 30, window: 3600 },
  oauthRegisterDaily: { requests: 5000, window: 86400, site: true, lease: 10 },
  oauthToken: { requests: 120, window: 60, local: true },
  // A refresh rewrites its grant and writes a token: the grant's day, its account's, then the site's. An app in use
  // refreshes once in fourteen days, so a refused refresh leaves the token it holds working.
  oauthRefreshGrant: { requests: 48, window: 86400 },
  oauthRefreshAccount: { requests: 500, window: 86400 },
  oauthRefreshDaily: { requests: 100000, window: 86400, site: true, lease: 50 },
  // A consent begun writes a transaction, and its answer a grant and a code: the account's day, then the site's.
  oauthConsentAccount: { requests: 50, window: 86400 },
  oauthConsentDaily: { requests: 5000, window: 86400, site: true, lease: 10 },
  // Settings reading or ending an account's connected apps: every request in the isolate, and each that reads KV (a
  // read per grant) by the account's day.
  connections: { requests: 60, window: 60, local: true },
  connectionsDaily: { requests: 300, window: 86400 },
  // The account MCP server's tool calls: per account by the minute and the day, then the site's day. An admin's app is
  // a contributor's agent at work and has allowances of its own.
  mcpAccount: { requests: 120, window: 60, local: true },
  mcpAccountDaily: { requests: 5000, window: 86400, lease: 32 },
  mcpAccountBudget: { requests: 500000, window: 86400, site: true, lease: 50 },
  // The same server's other requests, which apps send every turn: an account's first two hundred a day are counted by
  // the isolate alone (mcpListLimits), past them its day is counted in blocks.
  mcpList: { requests: 600, window: 60, local: true },
  mcpListFree: { requests: 200, window: 86400, local: true, kept: true },
  mcpListDaily: { requests: 20000, window: 86400, lease: 64 },
  mcpAdmin: { requests: 1200, window: 60, local: true },
  mcpAdminDaily: { requests: 100000, window: 86400, lease: 64 },
  mcpAdminItemsDay: { requests: 100000, window: 86400 },
  // A token the OAuth library looks up and does not find, per address: past these a minute, its tokens are refused
  // before the lookup's KV read.
  mcpChallenge: { requests: 120, window: 60, local: true },
  // Collection writes per account by the hour and the day, the site's day, and the apps' own day.
  collectionWrite: { requests: 30, window: 3600, work: true },
  collectionWriteDaily: { requests: 100, window: 86400, work: true },
  collectionWritesSite: { requests: 2000, window: 86400, site: true, work: true, lease: 5 },
  mcpCollectionWritesSite: { requests: 500, window: 86400, site: true, work: true, lease: 5 },
  fitVote: { requests: 120, window: 3600, work: true },
  fitVoteDaily: { requests: 500, window: 86400, work: true },
  // A vote on whether a palette fits a search: the account's by the fit votes above, then the site's day.
  searchVotesSite: { requests: 20000, window: 86400, site: true, work: true, lease: 20 },
  // An admin's curation, a chore of dozens in an hour.
  curation: { requests: 600, window: 3600, work: true },
  // Palettes taken out of an account's own collections, and put back with an undo.
  collectionItems: { requests: 300, window: 3600, work: true },
  collectionItemsDaily: { requests: 500, window: 86400, work: true },
  // A search counted for the Popular tags: an address's hour, the same words once a day, then the site's day.
  searchCount: { requests: 30, window: 3600, local: true },
  searchCountOnce: { requests: 1, window: 86400, local: true },
  searchCountDaily: { requests: 20000, window: 86400, site: true, lease: 20 },
  // A public palette used, counted for seeding: each counted use writes a row.
  paletteUse: { requests: 300, window: 3600, local: true },
  paletteUseOnce: { requests: 1, window: 86400, local: true },
  paletteUseDaily: { requests: 50000, window: 86400, site: true, lease: 50 },
  // An error a page reports from the reader's browser, logged.
  clientError: { requests: 20, window: 3600, local: true },
  clientErrorDaily: { requests: 5000, window: 86400, site: true, lease: 10 },
  // A public list or search the edge cache did not hold: each reads the database.
  listMiss: { requests: 60, window: 60, local: true },
  // An old link no map holds and the edge cache did not hold, fitted on the Worker: a fit is CPU alone, tens of
  // milliseconds, per address and for the site's day. The day's is sized for the move from the old app: crawlers asked
  // about 150,000 such links a day after it (17 Oct 2026) and spent 50,000 in nine hours, after which an old link
  // answered the page a browser fits, never a 301 a search engine follows. At about 60 ms a fit the whole allowance is
  // about 18M CPU-ms a day, and 90M at the fit's budget.
  oldLinkFit: { requests: 60, window: 60, local: true },
  oldLinkFitDaily: { requests: 300000, window: 86400, site: true, lease: 20 },
  // Like counts a page reads again once its own are old: up to 96 rows each, which no cache keeps.
  likeCounts: { requests: 60, window: 60, local: true },
  // An account's own Saved list and sync, a page load or a window focus each.
  savedRead: { requests: 60, window: 60, local: true },
  // Saved as the server reads it, a page or a search: a search ranks every like the account has, so its day of them is
  // bounded however many it holds.
  savedListDaily: { requests: 3000, window: 86400, lease: 16 }
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

export const STAGING_WORK_SCALE = 100;

export const isLimitName = (value: string): value is LimitName => Object.hasOwn(LIMITS, value);

/** A limit as it is counted: a `work` limit of a `scaled` check allows STAGING_WORK_SCALE times as much. */
export function limitOf(name: LimitName, scaled = false): Limit {
  const limit: Limit = LIMITS[name];
  return scaled && limit.work ? { ...limit, requests: limit.requests * STAGING_WORK_SCALE } : limit;
}
