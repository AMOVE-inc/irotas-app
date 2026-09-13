import { normalizeBoardReactionEmoji } from "./board-reactions";

/** Aggregate-only Discord exports retain the count without inventing member identities. */
export function importedIntroductionReactions(messageId: string, source: Record<string, unknown> | null | undefined): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [rawEmoji, value] of Object.entries(source ?? {})) {
    const emoji = normalizeBoardReactionEmoji(rawEmoji);
    const users = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string")
      : value && typeof value === "object" && Array.isArray((value as { users?: unknown }).users)
        ? (value as { users: unknown[] }).users.filter((id): id is string => typeof id === "string") : [];
    const count = value && typeof value === "object" && "count" in value ? Number((value as { count: unknown }).count) : users.length;
    const missing = Math.max(0, Math.min(10000, Math.floor(count) - users.length));
    result[emoji] = [...new Set([...(result[emoji] ?? []), ...users.map((id) => id.startsWith("discord-") ? id : `discord-${id}`), ...Array.from({ length: missing }, (_, index) => `discord-reaction-unresolved-${messageId}-${emoji}-${index}`)])];
  }
  if (!result["🎉"]?.length) result["🎉"] = [`discord-reaction-default-${messageId}`];
  return result;
}
