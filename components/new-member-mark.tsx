import type { Member } from "@/constants/mock-data";
import { isNewRegularMember } from "@/lib/member-status";
import { Text } from "react-native";

export function NewMemberMark({ member, size = 14 }: { member: Pick<Member, "rank" | "joinedAt">; size?: number }) {
  if (!isNewRegularMember(member)) return null;
  return <Text accessibilityLabel="初心者メンバー" style={{ fontSize: size, marginLeft: 4 }}>🔰</Text>;
}
