import { useEffect, useSyncExternalStore } from "react";
import { type Club } from "@/constants/mock-data";
import * as Api from "@/lib/_core/api";

// 部活動の所属状態はサーバーのDiscordロール移行結果を唯一の情報源にする。
// 初期モックを表示すると、実際には部員である会員にも一瞬「入部申請」が出る。
let clubs: Club[] = [];

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
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    icon: record.icon,
    leaderId: record.leaderId,
    leaderName: record.leaderName,
    memberIds: [...record.memberIds],
    members: record.members?.map((member) => ({ ...member, branches: [...member.branches] })),
    applicantIds: [...record.applicantIds],
    applications: record.applications.map((item) => ({ ...item })),
    createdByAdmin: true,
    events: [],
    viewerMembershipStatus: record.viewerMembershipStatus,
    viewerIsLeader: record.viewerIsLeader,
    canReviewApplications: record.canReviewApplications,
    viewerMemberId: record.viewerMemberId,
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

export async function removeClubMember(clubId: string, memberId: string) {
  const updated = asClub(await Api.removeClubMember(clubId, memberId));
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
