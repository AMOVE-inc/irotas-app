import type { Member } from "@/constants/mock-data";
import { isNewRegularMember } from "@/lib/member-status";
import { getMemberStaffRole } from "@/lib/member-staff-role";
import { Text } from "react-native";

export function NewMemberMark({ member, size = 14 }: { member: Pick<Member, "rank" | "joinedAt"> & { role?: string; name?: string }; size?: number }) {
  if (getMemberStaffRole(member.name, member.role) || !isNewRegularMember(member)) return null;
  return <Text accessibilityLabel="初心者メンバー" style={{ fontSize: size, marginLeft: 4 }}>🔰</Text>;
}
