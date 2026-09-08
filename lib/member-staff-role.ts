export type MemberStaffRole = "admin" | "operator" | null;

export function getMemberStaffRole(name?: string, role?: string): MemberStaffRole {
  const normalized = name ?? "";
  if (/IRO\+代表/.test(normalized) || role === "admin") return "admin";
  if (/IRO[+＋]運営|【運営(?:メンバー)?】|運営メンバー/.test(normalized) || role === "operator") return "operator";
  return null;
}

export function shouldShowMemberRank(rank?: string, name?: string, role?: string): boolean {
  // レギュラー会員はバッジを出さず、ランクアップ後だけを視覚的に示す。
  return rank !== "regular" && getMemberStaffRole(name, role) === null;
}
