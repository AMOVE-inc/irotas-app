export type MigrationImportType = "members" | "events" | "participations" | "organizers" | "role_mappings" | "announcements";

export const MIGRATION_COLUMNS: Record<MigrationImportType, string[]> = {
  members: ["member_id", "subscription_created_at", "discord_user_id", "discord_name", "billing_email", "display_name", "discord_roles", "achievement_badges", "discord_joined_at", "member_term", "member_rank", "square_customer_id", "square_subscription_id", "subscription_status", "billing_status", "overdue_since", "grace_until_date", "paid_until_date"],
  events: ["event_id", "event_name", "event_date", "event_time", "location", "event_type", "capacity"],
  participations: ["event_id", "discord_user_id", "status", "occurred_at", "source_reference"],
  organizers: ["event_id", "discord_user_id", "organizer_role"],
  role_mappings: ["source", "external_id", "role_key", "role_name", "category"],
  announcements: ["message_id", "channel_id", "discord_user_id", "author_name", "content", "created_at", "attachment_urls"],
};

export function parseCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"' && quoted && csv[index + 1] === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(field.trim()); field = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function validateMigrationCsv(type: MigrationImportType, csv: string) {
  const rows = parseCsv(csv);
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const required = type === "members"
    ? ["discord_user_id", "discord_name", "billing_email"]
    : type === "events"
      ? ["event_id", "event_name", "event_date"]
      : type === "role_mappings"
        ? ["source", "external_id", "role_name", "category"]
        : type === "announcements"
          ? ["message_id", "channel_id", "author_name", "content", "created_at"]
        : ["event_id", "discord_user_id"];
  const missing = required.filter((column) => !headers.includes(column));
  return { rows, missing };
}
