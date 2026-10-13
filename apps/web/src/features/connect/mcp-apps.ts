/* The apps the MCP page adds Grabient to, each in the form its maker documents, with the page's own address filled in.
   Only an app that connects the way the server asks is here: a remote MCP server over HTTP that signs the account in
   with OAuth, by a published client document or by registering itself. An app whose sign-in fails cannot use the
   server, so it stays off the page until it works. Each form names the document it follows, since forms change with
   an app's releases. */

/** Where the site answers apps: the server's MCP_PATH (server/oauth/clients.ts), which client code cannot import. */
export const MCP_PATH = "/mcp";

export interface McpLink {
  /** the app's name, the same in every language */
  label: string;
  /** the app's own install link for this address, with Grabient's name filled in for the reader to confirm */
  link: (address: string) => string;
  /** a page on the maker's site, which opens in a new tab; without it the link opens the app itself */
  web?: boolean;
}

/* an app's one-click link carries its config as base64 where its maker asks for that */
const base64 = (config: unknown) => encodeURIComponent(btoa(JSON.stringify(config)));

/* The popular apps whose makers give a one-click link. Each press is words alone: Claude's and VS Code's marks are not
   given for such a press, and one app's mark alone would set its press apart. */
export const MCP_LINKS: readonly McpLink[] = [
  /* the Add custom connector dialog, filled in:
     https://claude.com/docs/connectors/building/directory-vs-custom#custom-connector-install-link */
  {
    label: "Claude",
    web: true,
    link: address =>
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Grabient&connectorUrl=${encodeURIComponent(address)}`
  },
  /* the install deeplink, a remote server by its url: https://cursor.com/docs/mcp/install-links */
  {
    label: "Cursor",
    link: address =>
      `cursor://anysphere.cursor-deeplink/mcp/install?name=Grabient&config=${base64({ url: address })}`
  },
  /* the install URL: https://code.visualstudio.com/api/extension-guides/ai/mcp#create-an-mcp-installation-url */
  {
    label: "VS Code",
    link: address =>
      `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "Grabient", type: "http", url: address }))}`
  }
];

export interface McpSetup {
  /** the app's name, the same in every language */
  label: string;
  /** what the reader runs or pastes, with the address filled in */
  code: (address: string) => string;
  /** commands, run in a terminal */
  terminal?: boolean;
  /** the file it goes in, or the place in the app, as the app writes it */
  where?: string;
  /** the maker's guide to adding a server */
  guide: string;
}

const json = (config: unknown) => JSON.stringify(config, null, 2);

/* Each app's setup by hand, a tab each on the page. A terminal's second line is the app's own sign-in, which these
   apps leave to a command of its own. */
export const MCP_SETUPS: readonly McpSetup[] = [
  /* a remote HTTP server at user scope, since the default loads it only in the folder the line is run in:
     https://code.claude.com/docs/en/mcp#user-scope, #authenticate-from-the-command-line */
  {
    label: "Claude Code",
    terminal: true,
    guide: "https://code.claude.com/docs/en/mcp",
    code: address =>
      `claude mcp add --transport http grabient --scope user ${address}\nclaude mcp login grabient`
  },
  /* a streamable HTTP server, then the OAuth sign-in, which Codex starts only on its own command:
     https://learn.chatgpt.com/docs/extend/mcp */
  {
    label: "Codex",
    terminal: true,
    guide: "https://learn.chatgpt.com/docs/extend/mcp",
    code: address => `codex mcp add grabient --url ${address}\ncodex mcp login grabient`
  },
  /* a form in ChatGPT on the web, OAuth among its sign-ins:
     https://developers.openai.com/api/docs/guides/custom-mcp-server#how-to-use */
  {
    label: "ChatGPT",
    where: "Plugins → + → Add custom MCP server",
    guide: "https://developers.openai.com/api/docs/guides/custom-mcp-server",
    code: address => address
  },
  /* the global mcp.json, a remote server by its url: https://cursor.com/docs/mcp#configuration-locations */
  {
    label: "Cursor",
    where: "~/.cursor/mcp.json",
    guide: "https://cursor.com/docs/mcp",
    code: address => json({ mcpServers: { grabient: { url: address } } })
  },
  /* the user's portable file, read in every folder, which VS Code prefers for a new server over .vscode/mcp.json:
     https://code.visualstudio.com/docs/agent-customization/mcp-servers#_configure-the-mcpjson-file */
  {
    label: "VS Code",
    where: "~/.copilot/mcp-config.json",
    guide: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
    code: address => json({ mcpServers: { grabient: { type: "http", url: address } } })
  },
  /* Devin CLI's user scope, which Devin Desktop also reads for its default agent:
     https://docs.devin.ai/cli/extensibility/mcp/configuration#adding-mcp-servers, #authentication */
  {
    label: "Devin",
    terminal: true,
    guide: "https://docs.devin.ai/cli/extensibility/mcp/configuration",
    code: address => `devin mcp add --scope user grabient ${address}\ndevin mcp login grabient`
  },
  /* a chat connector added by its URL, OAuth by default: https://docs.lovable.dev/integrations/custom-mcp */
  {
    label: "Lovable",
    where: "Connectors → + → MCP server",
    guide: "https://docs.lovable.dev/integrations/custom-mcp",
    code: address => address
  }
];

/** The shape most other apps read, for the page's last tab. */
export const otherSetup = (address: string) =>
  json({ mcpServers: { grabient: { type: "http", url: address } } });
