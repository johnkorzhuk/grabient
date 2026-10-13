/* Text a reader typed, from any keyboard or input method. */

/** A number in the digits JavaScript reads. Persian ۰-۹, Arabic ٠-٩ and Thai ๐-๙ digits count, and full-width ０-９ with
    its signs (NFKC). The Arabic decimal separator ٫, a comma and the Arabic comma ، are the decimal point, a true minus
    or a dash is a minus, and a space or the Arabic thousands separator ٬ between digits only groups them: 1 920 is
    1920. */
export function numeral(text: string): string {
  return text
    .normalize("NFKC")
    .trim()
    .replace(/[٠-٩۰-۹๐-๙]/g, d =>
      String(d.charCodeAt(0) - (d >= "๐" ? 0x0e50 : d >= "۰" ? 0x06f0 : 0x0660))
    )
    .replace(/(\d)[\s٬]+(?=\d)/g, "$1")
    .replace(/[٫,،]/g, ".")
    .replace(/[−‒–]/g, "-");
}

/** Six hex digits, with or without `#`, as `#rrggbb`: a full-width ＃ＦＦ８８００ reads as the hex it spells. Null for
    anything else. */
export function typedHex(text: string): string | null {
  const raw = numeral(text).trim();
  return /^#?[0-9a-fA-F]{6}$/.test(raw) ? `#${raw.replace("#", "").toLowerCase()}` : null;
}
