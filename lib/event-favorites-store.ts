import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "irotas_event_favorites";
let favoriteIds: string[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((listener) => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
function snapshot() { return favoriteIds; }

export async function hydrateEventFavorites(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    favoriteIds = raw ? JSON.parse(raw) : [];
    emit();
  } catch { favoriteIds = []; }
}

export function useEventFavorites(): string[] {
  void hydrateEventFavorites();
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function toggleEventFavorite(eventId: string): boolean {
  const nextFavorite = !favoriteIds.includes(eventId);
  favoriteIds = nextFavorite ? [...favoriteIds, eventId] : favoriteIds.filter((id) => id !== eventId);
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify(favoriteIds));
  return nextFavorite;
}
