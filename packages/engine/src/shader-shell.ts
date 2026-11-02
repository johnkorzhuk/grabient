/* What every shader text and page the Shader tab writes shares, the palette's (shader.ts, shader-page.ts) and the
   effects' (glass-shader.ts): the credit that says where it came from, and the page around a drawing. Loaded with
   those, never with a page's start. */

/** The credit a shader's text or page starts with, its lines without their comment marks: the seed, the address it
    was taken from where there is one, and what it is. */
export const shaderCreditLines = (seed: string, address: string | null, what: string): string[] =>
  address ? [`grabient ${seed}`, address, what] : [`grabient ${seed}`, what];

/** A script element of a page: a shader's source (`id` names it, `type` says its language) written inline, or code the
    page runs, written on its own lines between its tags. */
export interface PageScript {
  code: string;
  id?: string;
  type?: string;
}

/** A complete page that runs as pasted: the credit in a comment right after the doctype, a canvas filling the window,
    and its scripts in order. */
export const shaderPageHtml = (
  credit: readonly string[],
  seed: string,
  scripts: readonly PageScript[]
): string => `<!doctype html>
<!--
${credit.map(line => `  ${line}`).join("\n")}
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>grabient ${seed}</title>
<style>
  html, body { margin: 0; height: 100%; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
<canvas></canvas>
${scripts
  .map(({ code, id, type }) =>
    id
      ? `<script type="${type}" id="${id}">${code}</script>`
      : `${type ? `<script type="${type}">` : "<script>"}\n${code}\n</script>`
  )
  .join("\n")}
</body>
</html>
`;
