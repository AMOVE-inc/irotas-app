import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardThread } from "../constants/mock-data";

const BOARD_THREAD_EDITS_KEY = "irotas_board_thread_edits_v1";

export type BoardThreadEdits = Record<string, BoardThread>;

export function applyBoardThreadEdits(
  threads: BoardThread[],
  edits: BoardThreadEdits,
): BoardThread[] {
  return threads.map((thread) => edits[thread.id] ?? thread);
}

export async function loadBoardThreadEdits(): Promise<BoardThreadEdits> {
  try {
    const raw = await AsyncStorage.getItem(BOARD_THREAD_EDITS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as BoardThreadEdits
      : {};
  } catch {
    return {};
  }
}

export async function saveBoardThreadEdit(thread: BoardThread): Promise<void> {
  const edits = await loadBoardThreadEdits();
  await AsyncStorage.setItem(
    BOARD_THREAD_EDITS_KEY,
    JSON.stringify({ ...edits, [thread.id]: thread }),
  );
}
