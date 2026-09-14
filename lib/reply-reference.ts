export type ReplyReference = {
  id: string;
  authorName: string;
  excerpt: string;
};

export function replyReference(id: string, authorName: string, content: string, hasAttachment = false): ReplyReference {
  const excerpt = content.replace(/\s+/g, " ").trim().slice(0, 140);
  return { id, authorName: authorName.trim().slice(0, 100) || "メンバー", excerpt: excerpt || (hasAttachment ? "添付ファイル" : "メッセージ") };
}

export function validReplyReference(value: unknown): value is ReplyReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.length > 0 && item.id.length <= 160 &&
    typeof item.authorName === "string" && item.authorName.length <= 100 &&
    typeof item.excerpt === "string" && item.excerpt.length <= 140;
}
