export type AppRoleCategory = "operator" | "branch" | "generation" | "club" | "rank" | "other";

export type ParsedExternalRole = {
  externalId: string;
  name: string;
};

export function classifyRoleName(name: string): AppRoleCategory {
  const normalized = name.trim().toLowerCase();
  if (/運営|管理者|admin|operator/.test(normalized)) return "operator";
  if (/関東支部|関西支部|\bbranch\b/.test(normalized)) return "branch";
  if (/第\s*\d+\s*期|期メンバー|generation/.test(normalized)) return "generation";
  if (/プラチナ|ゴールド|シルバー|レギュラー|platinum|gold|silver|regular/.test(normalized)) return "rank";
  if (/部$|部員|部長|club/.test(normalized)) return "club";
  return "other";
}

export function roleKey(category: AppRoleCategory, externalId: string, name: string): string {
  const base = externalId || name;
  const safe = base.normalize("NFKC").toLowerCase().replace(/[^a-z0-9\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `${category}:${safe || "unknown"}`.slice(0, 128);
}

/** Accepts `roleId:role name|roleId:role name` and name-only legacy values. */
export function parseDiscordRoles(value: string): ParsedExternalRole[] {
  return value
    .split(/[|;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(":");
      if (separator > 0) {
        return { externalId: part.slice(0, separator).trim(), name: part.slice(separator + 1).trim() };
      }
      return { externalId: `name:${part}`, name: part };
    })
    .filter((role) => role.externalId && role.name);
}

export function normalizedRank(name: string): "regular" | "silver" | "gold" | "platinum" | null {
  const value = name.toLowerCase();
  if (/platinum|プラチナ/.test(value)) return "platinum";
  if (/gold|ゴールド/.test(value)) return "gold";
  if (/silver|シルバー/.test(value)) return "silver";
  if (/regular|レギュラー/.test(value)) return "regular";
  return null;
}

/** Discord上の表彰・受賞ロールはプロフィール用バッジとして保持する。 */
export function isAchievementRole(name: string): boolean {
  return /大賞|表彰|受賞|award|winner|champion|優勝/i.test(name.normalize("NFKC"));
}
