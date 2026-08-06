import { useSyncExternalStore } from "react";

export type InAppNotification = {
  id: string;
  targetMemberId: string;
  type: "club_application" | "club_approval" | "event_confirmed" | "event_deadline" | "event_reminder" | "event_cancellation";
  title: string;
  body: string;
  clubId?: string;
  eventId?: string;
  chatRoomId?: string;
  createdAt: string;
  read: boolean;
};

let notifications: InAppNotification[] = [];
const listeners = new Set<() => void>();

export function addInAppNotification(notification: Omit<InAppNotification, "id" | "createdAt" | "read">) {
  notifications = [
    {
      ...notification,
      id: `notification_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      read: false,
    },
    ...notifications,
  ];
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return notifications;
}

export function useInAppNotifications() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
