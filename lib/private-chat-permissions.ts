export type PrivateChatRole = {
  role?: string | null;
  accessRole?: string | null;
  access_role?: string | null;
};

export function isPrivateChatStaff(member: PrivateChatRole) {
  const accessRole = member.accessRole ?? member.access_role;
  return member.role === "admin" || member.role === "operator" || accessRole === "admin" || accessRole === "operator";
}

/** Staff can start private groups with members without requiring a mutual follow. */
export function canInviteWithoutMutualFollow(viewer: PrivateChatRole, target: PrivateChatRole) {
  return isPrivateChatStaff(viewer) || isPrivateChatStaff(target);
}
