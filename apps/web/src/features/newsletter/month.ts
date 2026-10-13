import { formatDate, locale } from "@grabient/i18n";

/* An issue is for a month of the Gregorian calendar. A language whose own calendar has other months (Persian's) is
   given the Gregorian month's name, since the same day in its own calendar falls in a month the issue does not name; one
   that only counts its years its own way (Thai's) keeps its count. */
const GREGORIAN_MONTHS = new Set(["gregory", "buddhist", "japanese", "roc"]);

/** The month an issue is for, in the reader's language and Latin digits: October 2026. */
export function monthOf(month: string): string {
  const [year, at] = month.split("-").map(Number);
  const own = new Intl.DateTimeFormat(locale()).resolvedOptions().calendar;
  return formatDate(Date.UTC(year, at - 1, 1), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    ...(GREGORIAN_MONTHS.has(own) ? {} : { calendar: "gregory" })
  });
}
