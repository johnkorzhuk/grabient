// Shared result shapes for the MCP tools.
//
// The three-way split replaces the old single unavailable() helper, which
// told the agent that ANY failure "is a configuration state" — a lie for a
// 400 on bad dimensions. Unconfigured, refused and empty are three different
// facts and an agent acts differently on each.

export function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function notConfigured(what: string, whatToSet: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${what} is not configured (${whatToSet}). This is a setup gap, not an empty result — do not report it as "no data".`,
      },
    ],
    isError: true,
  };
}

export function refused(what: string, status: number | string, message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${what} refused the request (${status}): ${message}\nThis is an upstream refusal — usually a malformed parameter or a permission gap — NOT missing data and NOT a configuration problem on our side.`,
      },
    ],
    isError: true,
  };
}

export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
