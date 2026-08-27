import AsyncStorage from "@react-native-async-storage/async-storage";
import { BOARD_COMMENTS, BOARD_THREADS, CHAT_MESSAGES, EVENTS, type BoardImage } from "../constants/mock-data";
import { formatMealReportArea } from "./restaurant-location";

export type HomeActivityKind = "announcement" | "event" | "contest_thread" | "contest_comment" | "introduction" | "meal_report" | "gourmet_advice" | "free_chat";

export interface HomeActivity {
  id: string;
  kind: HomeActivityKind;
  title: string;
  description: string;
  createdAt: string;
  route: string;
  params?: Record<string, string>;
  images?: BoardImage[];
  image?: BoardImage;
}

const STORAGE_KEY = "irotas_home_activities_v1";
const RELEVANT_BOARD_KINDS: Record<string, HomeActivityKind | undefined> = {
  "gourmet-contest": "contest_thread",
  "meal-report": "meal_report",
  "gourmet-advice": "gourmet_advice",
  "free-chat": "free_chat",
};

export function initialHomeActivities(): HomeActivity[] {
  const eventActivities = EVENTS.map((event): HomeActivity => ({
    id: `event:${event.id}`, kind: "event", title: event.title,
    description: event.eventType === "official"
      ? "新しい公式イベントが公開されました"
      : event.eventType === "club"
        ? "新しい部活動イベントが公開されました"
        : "新しいグルメ会が公開されました",
    createdAt: event.createdAt ?? `${event.date}T${event.time}:00+09:00`, route: "/event-detail", params: { id: event.id },
  }));
  const threadActivities = BOARD_THREADS.flatMap((thread): HomeActivity[] => {
    const kind = RELEVANT_BOARD_KINDS[thread.category];
    return kind ? [{ id: `thread:${thread.id}`, kind, title: thread.title, description: thread.mealReport ? `📍 ${thread.mealReport.areaDisplay ?? formatMealReportArea(thread.mealReport.prefecture)}　${thread.preview}` : thread.preview, createdAt: thread.lastUpdated, route: "/board", params: { category: thread.category, view: "threads" }, images: thread.mealReport ? thread.images?.slice(0, 4) : undefined }] : [];
  });
  const contestComments = BOARD_COMMENTS.flatMap((comment): HomeActivity[] => {
    const thread = BOARD_THREADS.find((item) => item.id === comment.threadId && item.category === "gourmet-contest");
    return thread ? [{ id: `comment:${comment.id}`, kind: "contest_comment", title: `${thread.title}にコメントが追加されました`, description: comment.content, createdAt: comment.createdAt, route: "/board", params: { category: "gourmet-contest", view: "threads" } }] : [];
  });
  const announcements = CHAT_MESSAGES.filter((message) => message.chatId === "board-announcement").map((message): HomeActivity => ({
    id: `announcement:${message.id}`, kind: "announcement", title: "運営アナウンスが更新されました", description: message.content, createdAt: message.createdAt, route: "/chat", params: { id: "board-announcement" },
  }));
  return [...eventActivities, ...threadActivities, ...contestComments, ...announcements];
}

export async function recordHomeActivity(activity: HomeActivity): Promise<void> {
  const current = await getStoredHomeActivities();
  const next = [activity, ...current.filter((item) => item.id !== activity.id)].slice(0, 200);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function getStoredHomeActivities(): Promise<HomeActivity[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as HomeActivity[] : [];
  } catch {
    return [];
  }
}

export async function getHomeActivities(): Promise<HomeActivity[]> {
  const merged = new Map(initialHomeActivities().map((activity) => [activity.id, activity]));
  (await getStoredHomeActivities()).forEach((activity) => merged.set(activity.id, activity));
  return [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function boardActivityForThread(thread: { id: string; category: string; title: string; preview: string; lastUpdated: string; author: { name: string }; images?: BoardImage[]; mealReport?: { prefecture: string; areaDisplay?: string } }): HomeActivity | null {
  const kind = RELEVANT_BOARD_KINDS[thread.category];
  if (!kind) return null;
  return { id: `thread:${thread.id}`, kind, title: thread.title, description: thread.mealReport ? `📍 ${thread.mealReport.areaDisplay ?? formatMealReportArea(thread.mealReport.prefecture)}　${thread.preview}` : thread.preview, createdAt: thread.lastUpdated, route: "/board", params: { category: thread.category, view: "threads" }, images: thread.mealReport ? thread.images?.slice(0, 4) : undefined };
}
