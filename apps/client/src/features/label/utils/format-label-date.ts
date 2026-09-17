import { format, isThisYear, isToday, isYesterday } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import i18n from "@/i18n.ts";

export function formatLabelListDate(date: Date): string {
  if (isToday(date)) {
    return i18n.t("Today, {{time}}", { time: format(date, "h:mma") });
  }
  if (isYesterday(date)) {
    return i18n.t("Yesterday, {{time}}", { time: format(date, "h:mma") });
  }
  if (isThisYear(date)) {
    return format(date, "MMM dd", { locale: i18n.language?.startsWith("zh") ? zhCN : undefined });
  }
  return format(date, "MMM dd, yyyy", { locale: i18n.language?.startsWith("zh") ? zhCN : undefined });
}
