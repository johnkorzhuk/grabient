/* tokens.json is the one source of every value. This writes what reads it:
     src/tokens.css       custom properties: the scales on :root, the colors of each theme under [data-theme]
     src/tokens-host.css  the same tokens read from the variables an MCP host passes (`$host`), for the MCP view alone
     src/tokens.ts        the values as typed data, for code that draws: canvas, share images, email
   A variable is the token's group and name in kebab case: color.paperSolid is --color-paper-solid. The files pass
   through the repository's formatter, so they read as the rest of the code does and the linter takes them as written.
   node scripts/build-tokens.ts writes them; --check writes nothing and fails when any of them is stale. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

type Value = string | { dark: string; light: string };
interface Token {
  $value: Value;
  $type?: string;
  $description?: string;
  $host?: string;
}
type Group = { $type?: string; $description?: string } & {
  [name: string]: Token | string | undefined;
};
type Tokens = { $description?: string } & { [group: string]: Group | string | undefined };

const GROUPS = ["space", "radius", "font", "size", "motion", "color"] as const;
const ORDER = "@layer reset, tokens, base, components;";
const BANNER =
  "Generated from tokens.json by scripts/build-tokens.ts. Edit tokens.json, then run pnpm --filter @grabient/ui tokens.";

const kebab = (name: string) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const variable = (group: string, name: string) => `--${group}-${kebab(name)}`;

function entries(tokens: Tokens, group: string): [string, Token][] {
  const g = tokens[group] as Group;
  return Object.entries(g).filter((e): e is [string, Token] => !e[0].startsWith("$"));
}
const describe = (g: Group) => g.$description ?? "";
const mode = (v: Value, theme: "dark" | "light") => (typeof v === "string" ? v : v[theme]);

/* `$host` is a template whose `$` is the token's own value. A token whose variable is the host's own (font.sans is
   --font-sans) takes the host's value by name, so it has nothing to map: mapping it would make it refer to itself. */
function hosted(group: string, name: string, token: Token, value: string): string | null {
  if (!token.$host) return null;
  if (token.$host.startsWith(`var(${variable(group, name)},`)) return null;
  return token.$host.split("$").join(value);
}

function block(selector: string, lines: string[]): string {
  return `  ${selector} {\n${lines.map(l => `    ${l}`).join("\n")}\n  }`;
}
const declaration = (name: string, value: string, note?: string) =>
  note ? `${name}: ${value}; /* ${note} */` : `${name}: ${value};`;

function tokensCss(tokens: Tokens): string {
  const scales: string[] = [];
  for (const group of GROUPS) {
    if (group === "color") continue;
    scales.push(`/* ${describe(tokens[group] as Group)} */`);
    for (const [name, t] of entries(tokens, group))
      scales.push(declaration(variable(group, name), mode(t.$value, "dark"), t.$description));
  }
  const dark: string[] = [`/* ${describe(tokens.color as Group)} */`];
  const light: string[] = [];
  for (const [name, t] of entries(tokens, "color")) {
    dark.push(declaration(variable("color", name), mode(t.$value, "dark"), t.$description));
    /* a color the same in both themes is inherited from the dark one */
    if (mode(t.$value, "light") !== mode(t.$value, "dark"))
      light.push(declaration(variable("color", name), mode(t.$value, "light")));
  }
  return [
    `/* ${BANNER} */`,
    ORDER,
    "",
    "@layer tokens {",
    `${block(":root", scales)}\n`,
    `${block(':root,\n  [data-theme="dark"]', dark)}\n`,
    block('[data-theme="light"]', light),
    "}",
    ""
  ].join("\n");
}

function hostCss(tokens: Tokens): string {
  const value = (group: string, name: string, t: Token, theme: "dark" | "light") =>
    hosted(group, name, t, mode(t.$value, theme)) ?? mode(t.$value, theme);
  const dark: string[] = [];
  const light: string[] = [];
  for (const group of GROUPS)
    for (const [name, t] of entries(tokens, group)) {
      if (group !== "color") {
        const v = hosted(group, name, t, mode(t.$value, "dark"));
        if (v) dark.push(declaration(variable(group, name), v));
        continue;
      }
      dark.push(declaration(variable(group, name), value(group, name, t, "dark")));
      /* the light block names only what differs from the dark one */
      if (value(group, name, t, "light") !== value(group, name, t, "dark"))
        light.push(declaration(variable(group, name), value(group, name, t, "light")));
    }
  return [
    `/* ${BANNER} */`,
    "/* An MCP view is drawn inside another app, which passes its colors, type and radii as variables. Under",
    "   html[data-host] each token reads the app's variable, with Grabient's own value where the app passes none. */",
    ORDER,
    "",
    "@layer tokens {",
    `${block(":root[data-host]", dark)}\n`,
    block(':root[data-host][data-theme="light"]', light),
    "}",
    ""
  ].join("\n");
}

/* Numbers for code that draws: a px or ms value is its number in that unit, a bare number is a number, and anything
   else (a font stack, an em, a shadow, a gradient) stays the string CSS takes. */
function plain(value: string): string | number {
  const m = /^(-?\d*\.?\d+)(px|ms)?$/.exec(value);
  return m ? Number(m[1]) : value;
}
const UNITS: Record<string, string> = {
  space: " In px.",
  radius: " In px.",
  size: " In px.",
  motion: " Durations in ms."
};

function tokensTs(tokens: Tokens): string {
  const values = (group: string, theme: "dark" | "light") =>
    Object.fromEntries(entries(tokens, group).map(([n, t]) => [n, plain(mode(t.$value, theme))]));
  const out = [`/* ${BANNER} */`];
  for (const group of GROUPS) {
    if (group === "color") continue;
    const doc = `${describe(tokens[group] as Group)}${UNITS[group] ?? ""}`;
    out.push(
      "",
      `/** ${doc} */`,
      `export const ${group} = ${JSON.stringify(values(group, "dark"), null, 2)} as const;`
    );
  }
  const color = { dark: values("color", "dark"), light: values("color", "light") };
  out.push("", `/** ${describe(tokens.color as Group)} Each theme's value. */`);
  out.push(`export const color = ${JSON.stringify(color, null, 2)} as const;`, "");
  out.push("export type Theme = keyof typeof color;", "");
  return out.join("\n");
}

/** Every generated file, by its path in the package, from the parsed tokens.json. */
export function generate(tokens: Tokens): Record<string, string> {
  return {
    "src/tokens.css": tokensCss(tokens),
    "src/tokens-host.css": hostCss(tokens),
    "src/tokens.ts": tokensTs(tokens)
  };
}

const BIOME = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

/** Every generated file of the package at `root`, formatted, by its path in the package. */
export function build(root: string): Record<string, string> {
  const repo = join(root, "..", "..");
  const files = generate(JSON.parse(readFileSync(join(root, "tokens.json"), "utf8")));
  for (const [path, text] of Object.entries(files)) {
    const at = relative(repo, join(root, path));
    files[path] = execFileSync(process.execPath, [BIOME, "format", `--stdin-file-path=${at}`], {
      cwd: repo,
      input: text,
      encoding: "utf8"
    });
  }
  return files;
}

/** The files on disk that differ from what tokens.json makes now. */
export function stale(root: string): string[] {
  return Object.entries(build(root))
    .filter(([path, text]) => {
      try {
        return readFileSync(join(root, path), "utf8") !== text;
      } catch {
        return true;
      }
    })
    .map(([path]) => path);
}

if (import.meta.filename === process.argv[1]) {
  const root = join(import.meta.dirname, "..");
  if (process.argv.includes("--check")) {
    const behind = stale(root);
    if (behind.length) {
      console.error(`Stale: ${behind.join(", ")}. Run pnpm --filter @grabient/ui tokens.`);
      process.exit(1);
    }
    console.log("Tokens are current.");
  } else {
    const files = build(root);
    for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
    console.log(`Wrote ${Object.keys(files).join(", ")}.`);
  }
}
