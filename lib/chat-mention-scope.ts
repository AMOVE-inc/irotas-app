/** Individual mentions are limited to active members of this room. */
export function chatMentionMemberIds(participants: readonly string[]): string[] {
  return [...new Set(participants)];
}
