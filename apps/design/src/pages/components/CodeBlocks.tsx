import { type CodeTab, CodeTabs } from "@grabient/ui/CodeTabs.tsx";
import { CopyLine } from "@grabient/ui/CopyLine.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";
import styles from "./CodeBlocks.module.css";

/* The code block as the MCP page sets it: a tab for each app, the one Copy, the setup on the page's ground, and the
   line that says where it goes with the app's own guide. Then one line to copy, on the same paper. */
const ADDRESS = "https://grabient.com/mcp";
const json = (config: unknown) => JSON.stringify(config, null, 2);
const TABS: readonly CodeTab[] = [
  {
    label: "Claude Code",
    code: `claude mcp add --transport http grabient --scope user ${ADDRESS}\nclaude mcp login grabient`,
    where: { text: t("Terminal") },
    guide: {
      label: t("{app}'s guide", { app: "Claude Code" }),
      href: "https://code.claude.com/docs/en/mcp"
    }
  },
  {
    label: "Codex",
    code: `codex mcp add grabient --url ${ADDRESS}\ncodex mcp login grabient`,
    where: { text: t("Terminal") },
    guide: {
      label: t("{app}'s guide", { app: "Codex" }),
      href: "https://learn.chatgpt.com/docs/extend/mcp"
    }
  },
  {
    label: "Cursor",
    code: json({ mcpServers: { grabient: { url: ADDRESS } } }),
    where: { text: "~/.cursor/mcp.json", path: true },
    guide: { label: t("{app}'s guide", { app: "Cursor" }), href: "https://cursor.com/docs/mcp" }
  },
  {
    label: "VS Code",
    code: json({ mcpServers: { grabient: { type: "http", url: ADDRESS } } }),
    where: { text: "~/.copilot/mcp-config.json", path: true },
    guide: {
      label: t("{app}'s guide", { app: "VS Code" }),
      href: "https://code.visualstudio.com/docs/agent-customization/mcp-servers"
    }
  }
];

export function CodeBlocks() {
  return (
    <Section
      id="code-block"
      summary="The one code block: tabs, one Copy, the code set into the paper, and a line that says where it goes."
    >
      <Cells min={480}>
        <Cell caption="tabs · press one, or walk them with the arrows" column>
          <span class={styles.fill}>
            <CodeTabs aria-label="Apps" tabs={TABS} />
          </span>
        </Cell>
        <Cell caption="one line to copy" column>
          <span class={styles.fill}>
            <CopyLine text={ADDRESS} aria-label={t("Copy address")} />
          </span>
        </Cell>
      </Cells>
      <Block title="Rules">
        <Rules
          rules={[
            "One code block everywhere: a line to copy is its paper, its bar and its Copy.",
            "The code stands on the page's ground and scrolls past 480px; the line under it is on the paper, never read as code.",
            "Code is 13px, 12px under 520px wide, its comments in ink3. Copy and Copied share one cell, so nothing moves.",
            "Tabs walked by the arrows, Home and End; a copy the browser refuses selects the code instead."
          ]}
        />
      </Block>
    </Section>
  );
}
