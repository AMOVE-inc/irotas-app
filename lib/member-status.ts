import type { Member } from "@/constants/mock-data";

/** 会員ランクを問わず、入会から暦上の1か月未満だけを初心者として扱う。 */
export function isNewRegularMember(member: Pick<Member, "rank" | "joinedAt">, now = new Date()): boolean {
  const joinedAt = new Date(member.joinedAt);
  if (Number.isNaN(joinedAt.getTime())) return false;
  const expiresAt = new Date(joinedAt);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return now >= joinedAt && now < expiresAt;
}
