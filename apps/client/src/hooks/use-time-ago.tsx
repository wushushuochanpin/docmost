import { timeAgo } from "@/lib/time.ts";
import { useEffect, useState } from "react";

function resolveTimeAgoValue(date?: Date | string | null) {
  if (!date) {
    return "";
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return timeAgo(parsedDate);
}

export function useTimeAgo(date?: Date | string | null) {
  const [value, setValue] = useState(() => resolveTimeAgoValue(date));

  useEffect(() => {
    setValue(resolveTimeAgoValue(date));

    if (!date) {
      return;
    }

    const interval = setInterval(() => {
      setValue(resolveTimeAgoValue(date));
    }, 5 * 1000);

    return () => clearInterval(interval);
  }, [date]);

  return value;
}
