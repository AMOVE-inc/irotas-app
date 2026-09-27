import AsyncStorage from "@react-native-async-storage/async-storage";

export const NOTIFICATION_PREFERENCE_IDS = [
  "mention", "chat_message", "event_reminder", "event_approved", "club_leader", "club_join",
  "board_reply", "board_approved", "new_event", "points", "rank_up",
] as const;

export type NotificationPreferenceId = typeof NOTIFICATION_PREFERENCE_IDS[number];
export type NotificationPreferences = Record<NotificationPreferenceId, boolean>;

const STORAGE_KEY = "irotas_notification_preferences_v1";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = Object.fromEntries(
  NOTIFICATION_PREFERENCE_IDS.map((id) => [id, true]),
) as NotificationPreferences;

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function saveNotificationPreferences(value: NotificationPreferences) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export async function notificationEnabled(id: NotificationPreferenceId) {
  return (await getNotificationPreferences())[id];
}
