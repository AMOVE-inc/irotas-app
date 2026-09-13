import type { Event } from "@/constants/mock-data";
import type { AdminAnalytics } from "./_core/api";

function csvCell(value: string | number) {
  const text = String(value);
  // Event titles are member supplied. Keep spreadsheet applications from executing formulas.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildAdminAnalyticsCsv(analytics: AdminAnalytics, events: Event[]) {
  const rows: (string | number)[][] = [["区分", "項目", "値", "補足"]];
  rows.push(["会員", "利用可能会員数", analytics.totalMembers, "停止・退会・テストアカウントを除く"]);
  for (const [key, label] of [["male", "男性"], ["female", "女性"], ["other", "その他"], ["unset", "未設定"]])
    rows.push(["性別", label, analytics.genderCounts[key] ?? 0, "人"]);
  for (const [key, label] of [["regular", "レギュラー"], ["silver", "シルバー"], ["gold", "ゴールド"], ["platinum", "プラチナ"]])
    rows.push(["ランク", label, analytics.rankCounts[key] ?? 0, "人"]);
  for (const [key, label] of [["kanto", "関東"], ["kansai", "関西"]])
    rows.push(["支部", label, analytics.branchCounts[key] ?? 0, "複数所属は各支部に計上"]);
  for (const [month, count] of Object.entries(analytics.monthlyJoins).sort())
    rows.push(["入会月", month, count, "人"]);
  for (const event of events)
    rows.push(["イベント", event.title, event.attendees, `${event.date ?? ""} / 定員 ${event.capacity}`]);
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
