import type { BoardThread, ChatRoom } from "@/constants/mock-data";

export type InternalLinkMention = {
  raw: string;
  label: string;
  pathname: "/chat" | "/board" | "/event-detail";
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
  // IRO+ のURLだけをDiscord風のメンションとして扱う。外部URLは通常のリンクのままにする。
  const isIrotasHost = /(^|\.)irotas-community\.com$/i.test(url.hostname)
    || /^irotas-app-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.chatgpt\.site$/i.test(url.hostname);
  if (!isIrotasHost) return null;
  const pathname = url.pathname.replace(/^\/(?:\(tabs\)\/)?/, "/");
  if (pathname === "/event-detail") {
    const id = url.searchParams.get("id");
    if (!id) return null;
    return { raw, label: "📅 イベントを開く", pathname: "/event-detail", params: { id } };
  }
  if (pathname === "/chat") {
    const id = url.searchParams.get("id");
    const room = rooms.find((item) => item.id === id);
    if (!id) return null;
    const message = url.searchParams.get("message");
    return { raw, label: `#${room?.name ?? "チャット"}`, pathname: "/chat", params: { id, ...(message ? { message } : {}) } };
  }
  if (pathname === "/board") {
    const threadId = url.searchParams.get("thread");
    const thread = threads.find((item) => item.id === threadId);
    if (thread) return { raw, label: `#${thread.title}`, pathname: "/board", params: { category: thread.category, view: "threads", thread: thread.id } };
    const category = url.searchParams.get("category");
    if (category) return { raw, label: `#${threadId ? "スレッド" : "掲示板"}`, pathname: "/board", params: { category, view: url.searchParams.get("view") ?? "threads", ...(threadId ? { thread: threadId } : {}) } };
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
