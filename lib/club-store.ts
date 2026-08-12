import { useSyncExternalStore } from "react";
import { CLUBS, type Club } from "@/constants/mock-data";

let clubs: Club[] = CLUBS.map((club) => ({
  ...club,
  memberIds: [...club.memberIds],
  applicantIds: [...club.applicantIds],
  applications: club.applications.map((application) => ({ ...application })),
  events: club.events.map((event) => ({ ...event })),
}));

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function getClubs(): Club[] {
  return clubs;
}

export function subscribeClubs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useClubs(): Club[] {
  return useSyncExternalStore(subscribeClubs, getClubs, getClubs);
}

export function updateClub(updated: Club) {
  clubs = clubs.map((club) => (club.id === updated.id ? updated : club));
  emitChange();
}

export function addClub(club: Club) {
  clubs = [...clubs, club];
  emitChange();
}

export function removeClub(clubId: string) {
  clubs = clubs.filter((club) => club.id !== clubId);
  emitChange();
}
