import type { Member } from "@/constants/mock-data";

export const NEW_MEMBER_PERIOD_DAYS = 30;

/** 入会から30日未満のレギュラー会員だけを初心者として扱う。 */
export function isNewRegularMember(member: Pick<Member, "rank" | "joinedAt">, now = new Date()): boolean {
  if (member.rank !== "regular") return false;
  const joinedAt = new Date(member.joinedAt);
  if (Number.isNaN(joinedAt.getTime())) return false;
  const elapsed = now.getTime() - joinedAt.getTime();
  return elapsed >= 0 && elapsed < NEW_MEMBER_PERIOD_DAYS * 24 * 60 * 60 * 1000;
}
