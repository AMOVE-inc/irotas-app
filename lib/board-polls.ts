import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardPoll } from "@/constants/mock-data";

const POLLS_KEY = "irotas_board_polls_v1";
const FINALIZED_KEY = "irotas_board_poll_finalized_v1";
type StoredPolls = Record<string, BoardPoll>;

async function readPolls(): Promise<StoredPolls> {
  try { return JSON.parse(await AsyncStorage.getItem(POLLS_KEY) ?? "{}") as StoredPolls; } catch { return {}; }
}

export function isBoardPollOpen(poll: BoardPoll, now = new Date()): boolean {
  return now.getTime() <= new Date(`${poll.deadline}T23:59:59+09:00`).getTime();
}

export async function loadBoardPoll(ownerKey: string, fallback: BoardPoll): Promise<BoardPoll> {
  return (await readPolls())[ownerKey] ?? fallback;
}

export async function voteBoardPoll(ownerKey: string, poll: BoardPoll, optionId: string, memberId: string): Promise<BoardPoll> {
  if (!isBoardPollOpen(poll)) return poll;
  const next = applyBoardPollVote(poll, optionId, memberId);
  await AsyncStorage.setItem(POLLS_KEY, JSON.stringify({ ...(await readPolls()), [ownerKey]: next }));
  return next;
}

export function applyBoardPollVote(poll: BoardPoll, optionId: string, memberId: string): BoardPoll {
  const selected = poll.options.find((option) => option.id === optionId)?.voterIds.includes(memberId);
  const cleared = poll.options.map((option) => ({
    ...option,
    voterIds: poll.allowMultiple && option.id !== optionId ? option.voterIds : option.voterIds.filter((id) => id !== memberId),
  }));
  return { ...poll, options: cleared.map((option) => option.id === optionId && !selected ? { ...option, voterIds: [...option.voterIds, memberId] } : option) };
}

export function boardPollResult(poll: BoardPoll): string {
  const max = Math.max(0, ...poll.options.map((option) => option.voterIds.length));
  const winners = poll.options.filter((option) => option.voterIds.length === max).map((option) => option.text);
  return max === 0 ? "投票はありませんでした" : `${winners.join("・")}（${max}票）`;
}

export async function finalizeBoardPollOnce(ownerKey: string): Promise<boolean> {
  try {
    const finalized = JSON.parse(await AsyncStorage.getItem(FINALIZED_KEY) ?? "{}") as Record<string, boolean>;
    if (finalized[ownerKey]) return false;
    await AsyncStorage.setItem(FINALIZED_KEY, JSON.stringify({ ...finalized, [ownerKey]: true }));
    return true;
  } catch { return false; }
}
