import { RANK_LABELS, type Club, type Member, type MemberRank } from "../constants/mock-data";
export { mentionsViewer } from "./mention-matching";

export type MentionGroup = {
  id: string;
  label: string;
  description: string;
  memberIds: string[];
  category: "everyone" | "branch" | "admin" | "generation" | "club" | "rank";
};

const RANK_ORDER: MemberRank[] = ["regular", "silver", "gold", "platinum"];

export function getMentionGroups(members: Member[], clubs: Club[]): MentionGroup[] {
  const groups: MentionGroup[] = [
    { id: "everyone", label: "everyone", description: "全メンバー", memberIds: members.map((member) => member.id), category: "everyone" },
    { id: "branch-kanto", label: "関東支部", description: "関東支部のメンバー", memberIds: members.filter((member) => member.branch === "kanto").map((member) => member.id), category: "branch" },
    { id: "branch-kansai", label: "関西支部", description: "関西支部のメンバー", memberIds: members.filter((member) => member.branch === "kansai").map((member) => member.id), category: "branch" },
    { id: "admins", label: "運営", description: "運営メンバー", memberIds: members.filter((member) => member.role === "admin" || member.role === "operator").map((member) => member.id), category: "admin" },
  ];

  const generations = [...new Set(members.map((member) => member.generation).filter((generation) => generation > 0))].sort((a, b) => a - b);
  groups.push(...generations.map((generation) => ({
    id: `generation-${generation}`,
    label: `第${generation}期メンバー`,
    description: `第${generation}期のメンバー`,
    memberIds: members.filter((member) => member.generation === generation).map((member) => member.id),
    category: "generation" as const,
  })));

  groups.push(...clubs.map((club) => ({
    id: `club-${club.id}`,
    label: club.name,
    description: `${club.name}の部員`,
    memberIds: [...club.memberIds],
    category: "club" as const,
  })));

  groups.push(...RANK_ORDER.map((rank) => ({
    id: `rank-${rank}`,
    label: `${RANK_LABELS[rank]}会員`,
    description: `${RANK_LABELS[rank]}ランクのメンバー`,
    memberIds: members.filter((member) => member.rank === rank).map((member) => member.id),
    category: "rank" as const,
  })));

  return groups;
}

export function getMentionQuery(text: string): string | null {
  const atIndex = text.lastIndexOf("@");
  if (atIndex < 0) return null;
  const query = text.slice(atIndex + 1);
  return /[\r\n]/.test(query) || query.length > 80 ? null : query;
}

export function insertMention(text: string, label: string, memberId?: string): string {
  const atIndex = text.lastIndexOf("@");
  const mention = `@${label}${memberId ? `（${memberId}）` : ""} `;
  if (atIndex < 0) return `${text}${mention}`;
  return `${text.slice(0, atIndex)}${mention}`;
}

export function extractMentionLabels(content: string): string[] {
  return [...content.matchAll(/@([^\s@]+)/g)].map((match) => match[1].replace(/[、。！？!?.,，．]+$/g, ""));
}

export function getMentionedMemberIds(
  content: string,
  members: Member[],
  groups: MentionGroup[],
  scopeMemberIds?: string[],
): string[] {
  const labels = extractMentionLabels(content);
  const ids = new Set<string>();
  for (const label of labels) {
    groups.find((group) => group.label === label)?.memberIds.forEach((id) => ids.add(id));
    members.filter((member) => member.name === label).forEach((member) => ids.add(member.id));
  }
  if (!scopeMemberIds) return [...ids];
  const scope = new Set(scopeMemberIds);
  return [...ids].filter((id) => scope.has(id));
}

export function isGroupMention(label: string, groups: MentionGroup[]): boolean {
  return groups.some((group) => group.label === label);
}
