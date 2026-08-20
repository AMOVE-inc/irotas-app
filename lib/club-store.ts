import { useEffect, useSyncExternalStore } from "react";
import { CLUBS, type Club } from "@/constants/mock-data";
import * as Api from "@/lib/_core/api";

let clubs: Club[] = CLUBS.map((club) => ({
  ...club,
  memberIds: [...club.memberIds],
  applicantIds: [...club.applicantIds],
  applications: club.applications.map((application) => ({ ...application })),
  events: club.events.map((event) => ({ ...event })),
}));

const listeners = new Set<() => void>();
let loading: Promise<Club[]> | null = null;

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
  useEffect(() => { void refreshClubs(); }, []);
  return useSyncExternalStore(subscribeClubs, getClubs, getClubs);
}

function asClub(record: Api.ClubRecord): Club {
  const viewerAlias = "u1";
  const memberIds = record.viewerMembershipStatus === "approved"
    ? [...new Set([...record.memberIds, viewerAlias])]
    : [...record.memberIds];
  const applicantIds = record.viewerMembershipStatus === "pending" || record.viewerMembershipStatus === "on_hold"
    ? [...new Set([...record.applicantIds, viewerAlias])]
    : [...record.applicantIds];
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    icon: record.icon,
    leaderId: record.viewerIsLeader ? viewerAlias : record.leaderId,
    leaderName: record.leaderName,
    memberIds,
    applicantIds,
    applications: record.applications.map((item) => ({
      ...item,
      memberId: item.memberId === record.viewerMemberId ? viewerAlias : item.memberId,
    })),
    createdByAdmin: true,
    events: [],
  };
}

export async function refreshClubs() {
  if (loading) return loading;
  loading = Api.getClubs()
    .then((records) => {
      clubs = records.map(asClub);
      emitChange();
      return clubs;
    })
    .finally(() => { loading = null; });
  return loading;
}

export async function submitClubApplication(clubId: string, wantsToDo: string, messageToLeader: string) {
  const updated = asClub(await Api.submitClubApplication(clubId, wantsToDo, messageToLeader));
  updateClub(updated);
  return updated;
}

export async function reviewClubApplication(clubId: string, memberId: string, action: "approve" | "hold" | "reject") {
  const updated = asClub(await Api.reviewClubApplication(clubId, memberId, action));
  updateClub(updated);
  return updated;
}

export async function leaveClub(clubId: string) {
  const updated = asClub(await Api.leaveClub(clubId));
  updateClub(updated);
  return updated;
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
