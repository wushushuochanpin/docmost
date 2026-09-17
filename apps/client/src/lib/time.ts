import { formatDistanceStrict } from "date-fns";
import { format, isToday, isYesterday } from "date-fns";
import type { Locale } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import i18n from "@/i18n.ts";

/** Returns the date-fns locale matching the current i18n language. */
function getDateLocale(): Locale | undefined {
  const lang = i18n.language;
  if (lang === "zh-CN" || lang === "zh") return zhCN;
  return undefined; // default (en-US)
}

export function timeAgo(date: Date) {
  return formatDistanceStrict(new Date(date), new Date(), { addSuffix: true });
}

/** Format a date with locale-aware month/day names. Uses current i18n language. */
export function formatDateLocale(date: Date, fmt: string): string {
  return format(date, fmt, { locale: getDateLocale() });
}

export function formattedDate(date: Date) {
  if (isToday(date)) {
    return i18n.t("Today, {{time}}", { time: format(date, "h:mma") });
  } else if (isYesterday(date)) {
    return i18n.t("Yesterday, {{time}}", { time: format(date, "h:mma") });
  } else {
    return format(date, "MMM dd, yyyy, h:mma", { locale: getDateLocale() });
  }
}
