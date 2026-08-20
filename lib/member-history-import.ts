import { parseCsv } from "./migration-csv";

export type MemberHistoryImportRow = {
  discordUserId: string;
  participationCount: number;
  organizerCount: number;
};

export type MemberHistoryImportPreview = {
  rows: MemberHistoryImportRow[];
  participationTotal: number;
  organizerTotal: number;
};

function nonNegativeInteger(value: string, label: string, index: number) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized))
    throw new Error(`${index + 2}行目の${label}は0以上の整数で入力してください`);
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed > 10_000)
    throw new Error(`${index + 2}行目の${label}が大きすぎます`);
  return parsed;
}

export function parseMemberHistoryImport(csv: string): MemberHistoryImportPreview {
  const parsed = parseCsv(csv);
  if (!parsed.length) throw new Error("参加・幹事履歴がありません");
  const headers = Object.keys(parsed[0]);
  const required = ["discord_user_id", "participation_count", "organizer_count"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length)
    throw new Error(`不足している列があります：${missing.join("、")}`);

  const seen = new Set<string>();
  const rows = parsed.map((row, index) => {
    const discordUserId = String(row.discord_user_id ?? "").trim();
    if (!/^\d{17,20}$/.test(discordUserId))
      throw new Error(`${index + 2}行目のDiscord IDが正しくありません`);
    if (seen.has(discordUserId))
      throw new Error(`${index + 2}行目のDiscord IDが重複しています`);
    seen.add(discordUserId);
    return {
      discordUserId,
      participationCount: nonNegativeInteger(
        String(row.participation_count ?? ""),
        "参加回数",
        index,
      ),
      organizerCount: nonNegativeInteger(
        String(row.organizer_count ?? ""),
        "幹事回数",
        index,
      ),
    };
  });

  return {
    rows,
    participationTotal: rows.reduce((sum, row) => sum + row.participationCount, 0),
    organizerTotal: rows.reduce((sum, row) => sum + row.organizerCount, 0),
  };
}

