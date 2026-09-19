import type { BoardThread, ChatRoom } from "@/constants/mock-data";
import { displayEventTitle } from "./event-title";

const BOARD_CATEGORY_LABELS: Record<string, string> = {
  introduction: "自己紹介",
  "meal-report": "今日のごちそうさま報告",
  "gourmet-contest": "グルメ選手権",
  "gourmet-advice": "教えてグルメ相談室",
  "free-chat": "なんでも掲示板",
  "gourmet-map": "グルメマップ",
  "club-introduction": "部活動紹介・入部申請",
  "club-all": "活動報告",
};

export type InternalLinkPathname = "/chat" | "/board" | "/event-detail" | "/clubs" | "/gourmet-map";

export type InternalLinkMention = {
  raw: string;
  label: string;
  pathname: InternalLinkPathname;
  params: Record<string, string>;
};

export function formatEventLinkLabel(event: { date: string; time: string; title: string }) {
  const date = event.date.replace(/-/g, "/");
  return `📅 ${date}${event.time ? ` ${event.time}` : ""} ${displayEventTitle(event.title)}`;
}

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
    return { raw, label: "📅 イベント", pathname: "/event-detail", params: { id } };
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
    if (category) {
      const categoryLabel = url.searchParams.get("label") ?? BOARD_CATEGORY_LABELS[category] ?? (category.startsWith("club-") ? "部活動" : "掲示板");
      return { raw, label: `#${threadId ? "スレッド" : categoryLabel}`, pathname: "/board", params: { category, view: url.searchParams.get("view") ?? "threads", ...(threadId ? { thread: threadId } : {}) } };
    }
  }
  if (pathname === "/clubs") return { raw, label: "#部活動", pathname: "/clubs", params: {} };
  if (pathname === "/gourmet-map") return { raw, label: "#グルメマップ", pathname: "/gourmet-map", params: {} };
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
