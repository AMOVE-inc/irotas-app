export type MentionTargetMember = { id: string; name?: string; displayName?: string };
export type MentionTargetClub = { id: string; name: string };

function normalizeMentionLabel(label: string): string {
  return label.replace(/^@/, "").replace(/[、。！？!?.,，．]+$/g, "").trim();
}

/** Resolves display mentions without assuming that an imported target still exists. */
export function findMentionedMemberId(label: string, members: readonly MentionTargetMember[]): string | undefined {
  const normalized = normalizeMentionLabel(label);
  return members.find((member) => member.name === normalized || member.displayName === normalized)?.id;
}

/** Imported club mentions can have an emoji after the club name. */
export function findMentionedClub<T extends MentionTargetClub>(label: string, clubs: readonly T[]): T | undefined {
  const normalized = normalizeMentionLabel(label);
  return clubs.find((club) => club.name === normalized || normalized.startsWith(club.name));
}
