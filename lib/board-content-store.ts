import AsyncStorage from "@react-native-async-storage/async-storage";

const DELETED_THREADS_KEY = "irotas_deleted_board_threads_v1";
const COMMENT_EDITS_KEY = "irotas_board_comment_edits_v1";
const DELETED_COMMENTS_KEY = "irotas_deleted_board_comments_v1";

async function readIds(key: string): Promise<string[]> {
  try { return JSON.parse(await AsyncStorage.getItem(key) ?? "[]") as string[]; } catch { return []; }
}

export const loadDeletedBoardThreadIds = () => readIds(DELETED_THREADS_KEY);
export async function deleteBoardThread(threadId: string): Promise<void> {
  const ids = await readIds(DELETED_THREADS_KEY);
  if (!ids.includes(threadId)) await AsyncStorage.setItem(DELETED_THREADS_KEY, JSON.stringify([...ids, threadId]));
}
export async function loadBoardCommentEdits(): Promise<Record<string, string>> {
  try { return JSON.parse(await AsyncStorage.getItem(COMMENT_EDITS_KEY) ?? "{}") as Record<string, string>; } catch { return {}; }
}
export async function saveBoardCommentEdit(commentId: string, content: string): Promise<void> {
  await AsyncStorage.setItem(COMMENT_EDITS_KEY, JSON.stringify({ ...(await loadBoardCommentEdits()), [commentId]: content }));
}
export const loadDeletedBoardCommentIds = () => readIds(DELETED_COMMENTS_KEY);
export async function deleteBoardComment(commentId: string): Promise<void> {
  const ids = await readIds(DELETED_COMMENTS_KEY);
  if (!ids.includes(commentId)) await AsyncStorage.setItem(DELETED_COMMENTS_KEY, JSON.stringify([...ids, commentId]));
}
