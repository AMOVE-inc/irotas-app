import type { User as AuthUser } from "@/lib/_core/auth";
import {
  CURRENT_USER,
  DEFAULT_AVATAR,
  MEMBERS,
  type Member,
  type MemberRank,
} from "@/constants/mock-data";

const MEMBER_RANKS = new Set<MemberRank>(["regular", "silver", "gold", "platinum"]);

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function memberFromAuthUser(user: AuthUser | null | undefined): Member {
  if (!user) return CURRENT_USER;

  const knownMember = user.memberId
    ? MEMBERS.find((member) => member.id === user.memberId)
    : undefined;
  if (knownMember) return knownMember;

  const profile = user.profile ?? {};
  const rank = MEMBER_RANKS.has(user.memberRank as MemberRank)
    ? (user.memberRank as MemberRank)
    : "regular";
  const xp = Math.max(0, user.xp ?? 0);
  const generationMatch = user.memberTerm?.match(/\d+/);
  const fallbackName = user.email?.split("@")[0] || "未設定";

  return {
    id: user.memberId || `auth-${user.id}`,
    name: user.name?.trim() || fallbackName,
    avatar: DEFAULT_AVATAR,
    rank,
    points: xp,
    level: Math.floor(xp / 100) + 1,
    branch: user.branch === "kansai" ? "kansai" : "kanto",
    generation: generationMatch ? Number(generationMatch[0]) : 0,
    bio: typeof profile.bio === "string" ? profile.bio : "",
    interests: stringList(profile.interests),
    role: user.accessRole === "admin" ? "admin" : user.accessRole === "operator" ? "operator" : "member",
    joinedAt: user.joinedAt ?? "",
    participationCount: user.participationCount ?? 0,
    organizerCount: user.organizerCount ?? 0,
    followerCount: 0,
    followingCount: 0,
  };
}
