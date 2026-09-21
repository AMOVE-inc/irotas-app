import type { D1Database } from "./platform-types";

type EventParticipantSource = {
  id: string;
  organizer_member_id: number;
  public_data_json: string;
};

function eventData(row: EventParticipantSource) {
  try { return JSON.parse(row.public_data_json) as Record<string, unknown>; } catch { return {}; }
}

export function importedEventParticipantIdentifiers(row: EventParticipantSource): string[] {
  const data = eventData(row);
  const values = [data.manualParticipantIds, data.companionIds]
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return [...new Set(values)];
}

async function memberIdForIdentifier(db: D1Database, identifier: string) {
  const internal = /^member-(\d+)$/.exec(identifier);
  if (internal) return Number(internal[1]);
  const discordUserId = identifier.startsWith("discord-") ? identifier.slice("discord-".length) : "";
  const member = await db.prepare(`SELECT id FROM members
    WHERE public_member_id = ? OR (? <> '' AND discord_user_id = ?) LIMIT 1`)
    .bind(identifier, discordUserId, discordUserId).first<{ id: number }>();
  return member?.id ?? null;
}

/** Resolve both app participations and the participant list saved during Discord migration. */
export async function eventParticipantMemberIds(db: D1Database, row: EventParticipantSource): Promise<number[]> {
  const stored = await db.prepare(`SELECT member_id FROM event_participations
    WHERE event_id = ? AND status IN ('confirmed','cancel_requested')`)
    .bind(row.id).all<{ member_id: number }>();
  const memberIds = new Set((stored.results ?? []).map((item) => item.member_id));
  if (row.id.startsWith("discord-event-")) {
    for (const identifier of importedEventParticipantIdentifiers(row)) {
      const memberId = await memberIdForIdentifier(db, identifier);
      if (memberId) memberIds.add(memberId);
    }
    const data = eventData(row);
    if (data.organizerParticipates !== false) memberIds.add(row.organizer_member_id);
  }
  return [...memberIds];
}

export async function isEventParticipant(db: D1Database, row: EventParticipantSource, memberId: number): Promise<boolean> {
  return (await eventParticipantMemberIds(db, row)).includes(memberId);
}
