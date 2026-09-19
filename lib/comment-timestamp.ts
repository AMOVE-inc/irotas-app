import { japanDateKey } from "./japan-date";

/** Show comment time in Japan's calendar day, regardless of the device timezone. */
export function formatCommentTimestamp(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const day = japanDateKey(date);
  const today = japanDateKey(now);
  const yesterday = japanDateKey(new Date(now.getTime() - 86_400_000));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const time = `${values.hour}:${values.minute}`;

  if (day === today) return time;
  if (day === yesterday) return `昨日 ${time}`;
  return `${day.replace(/-/g, "/")} ${time}`;
}
