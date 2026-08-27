import type { BoardThread, ChatRoom } from "@/constants/mock-data";

export type InternalLinkMention = {
  raw: string;
  label: string;
  pathname: "/chat" | "/board";
  params: Record<string, string>;
};

const URL_PATTERN = /https?:\/\/[^\s<>]+/g;

function trimTrailingPunctuation(value: string) {
  return value.replace(/[)、。,.!?！？]+$/u, "");
}

export function parseInternalLink(rawValue: string, rooms: ChatRoom[], threads: BoardThread[]): InternalLinkMention | null {
  const raw = trimTrailingPunctuation(rawValue);
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const pathname = url.pathname.replace(/^\/(?:\(tabs\)\/)?/, "/");
  if (pathname === "/chat") {
    const id = url.searchParams.get("id");
    const room = rooms.find((item) => item.id === id);
    if (!id || !room) return null;
    return { raw, label: `#${room.name}`, pathname: "/chat", params: { id } };
  }
  if (pathname === "/board") {
    const threadId = url.searchParams.get("thread");
    const thread = threads.find((item) => item.id === threadId);
    if (thread) return { raw, label: `#${thread.title}`, pathname: "/board", params: { category: thread.category, view: "threads", thread: thread.id } };
  }
  return null;
}

export function splitInternalLinks(content: string) {
  const matches = [...content.matchAll(URL_PATTERN)];
  if (!matches.length) return [{ text: content, isUrl: false }];
  const parts: { text: string; isUrl: boolean }[] = [];
  let cursor = 0;
  matches.forEach((match) => {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: content.slice(cursor, index), isUrl: false });
    parts.push({ text: match[0], isUrl: true });
    cursor = index + match[0].length;
  });
  if (cursor < content.length) parts.push({ text: content.slice(cursor), isUrl: false });
  return parts;
}
