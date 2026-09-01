import fs from "node:fs";
const [membersPath, legacyArchivePath, outputPath] = process.argv.slice(2);
if (!membersPath || !legacyArchivePath || !outputPath) throw new Error("Usage: node scripts/build-discord-profile-import.mjs <members.json> <legacy-board-archive.json> <output.json>");
const members = JSON.parse(fs.readFileSync(membersPath, "utf8"));
const archive = JSON.parse(fs.readFileSync(legacyArchivePath, "utf8"));
// The current migration policy uses each member's most recent post in the
// Discord "自己紹介" forum as their IRO+ profile bio. Other board categories
// must never be treated as a profile bio. The archive can also provide a
// fallback avatar URL when the member export does not contain one.
const archiveAvatars = new Map();
const introductionBios = new Map();
const collectArchiveAvatars = (value) => {
  if (Array.isArray(value)) return value.forEach(collectArchiveAvatars);
  if (!value || typeof value !== "object") return;
  const record = value;
  const id = typeof record.authorId === "string" ? record.authorId : typeof record.discordUserId === "string" ? record.discordUserId : "";
  const avatar = typeof record.authorAvatarUrl === "string" ? record.authorAvatarUrl : typeof record.avatarUrl === "string" ? record.avatarUrl : "";
  if (id && /^https:\/\/(?:cdn\.|media\.)?discord(?:app)?\.(?:com|net)\//i.test(avatar) && !archiveAvatars.has(id)) archiveAvatars.set(id, avatar);
  Object.values(record).forEach(collectArchiveAvatars);
};
collectArchiveAvatars(archive);
for (const thread of Array.isArray(archive.threads) ? archive.threads : []) {
  if (thread?.category !== "introduction") continue;
  const authorId = typeof thread.authorId === "string" ? thread.authorId : "";
  const content = typeof thread.content === "string" ? thread.content.trim() : "";
  if (!authorId || !content) continue;
  const createdAt = typeof thread.createdAt === "string" ? thread.createdAt : "";
  const previous = introductionBios.get(authorId);
  if (!previous || Date.parse(createdAt) > Date.parse(previous.createdAt)) {
    introductionBios.set(authorId, { content, createdAt });
  }
}
const rank = (roles) => roles.some((role) => /platinum|プラチナ|💎/i.test(role)) ? "platinum" : roles.some((role) => /gold|ゴールド|🥇/i.test(role)) ? "gold" : roles.some((role) => /silver|シルバー|🥈/i.test(role)) ? "silver" : "regular";
const term = (roles) => { for (const role of roles) { const match = role.normalize("NFKC").match(/(?:第\s*)?(\d+)\s*期/); if (match) return `第${match[1]}期`; } return null; };
const profileBio = (member) => {
  const profile = member.profile && typeof member.profile === "object" ? member.profile : {};
  const userProfile = member.userProfile && typeof member.userProfile === "object" ? member.userProfile : {};
  const discordProfile = member.discordProfile && typeof member.discordProfile === "object" ? member.discordProfile : {};
  const candidates = [member.profileBio, member.discordProfileBio, profile.bio, userProfile.bio, discordProfile.bio, member.bio];
  const supplied = candidates.find((value) => typeof value === "string");
  return { hasProfileBio: typeof supplied === "string", bio: typeof supplied === "string" ? supplied.trim() : "" };
};
const rows = members.map((member) => {
  const discordUserId = String(member.discordUserId ?? "");
  const introduction = introductionBios.get(discordUserId);
  const suppliedProfile = profileBio(member);
  return {
    ...member,
    avatarUrl: typeof member.avatarUrl === "string" && member.avatarUrl.trim() ? member.avatarUrl.trim() : archiveAvatars.get(discordUserId) ?? "",
    // The explicit Discord-profile field remains preferred if it is ever
    // available in a future export. Today the self-introduction forum is the
    // approved source of truth for profile text.
    hasProfileBio: suppliedProfile.hasProfileBio || Boolean(introduction),
    bio: suppliedProfile.hasProfileBio ? suppliedProfile.bio : introduction?.content ?? "",
    memberRank: rank(member.discordRoles),
    memberTerm: term(member.discordRoles),
  };
});
fs.writeFileSync(outputPath, JSON.stringify({ confirmation: `IMPORT_DISCORD_PROFILES_${rows.length}`, rows }));
console.log(JSON.stringify({ rows: rows.length, profileBios: rows.filter((row) => row.hasProfileBio).length, introductionBios: rows.filter((row) => introductionBios.has(String(row.discordUserId ?? ""))).length, avatars: rows.filter((row) => row.avatarUrl).length, terms: rows.filter((row) => row.memberTerm).length }));
