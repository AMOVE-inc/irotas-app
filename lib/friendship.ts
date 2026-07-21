import { FRIENDSHIPS, MEMBERS, type Member } from "../constants/mock-data";

export function areFriends(memberIdA: string, memberIdB: string): boolean {
  if (memberIdA === memberIdB) return false;
  return FRIENDSHIPS.some(
    ([left, right]) =>
      (left === memberIdA && right === memberIdB) ||
      (left === memberIdB && right === memberIdA),
  );
}

export function getFriends(memberId: string): Member[] {
  return MEMBERS.filter((member) => areFriends(memberId, member.id));
}
