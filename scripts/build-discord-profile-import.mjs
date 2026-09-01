import fs from "node:fs";
const [membersPath, legacyArchivePath, outputPath] = process.argv.slice(2);
if (!membersPath || !legacyArchivePath || !outputPath) throw new Error("Usage: node scripts/build-discord-profile-import.mjs <members.json> <legacy-board-archive.json> <output.json>");
const members = JSON.parse(fs.readFileSync(membersPath, "utf8"));
// Kept as a positional argument for existing automation compatibility. Board
// threads must never be used as a member profile bio.
void legacyArchivePath;
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
const rows = members.map((member) => ({ ...member, ...profileBio(member), memberRank: rank(member.discordRoles), memberTerm: term(member.discordRoles) }));
fs.writeFileSync(outputPath, JSON.stringify({ confirmation: `IMPORT_DISCORD_PROFILES_${rows.length}`, rows }));
console.log(JSON.stringify({ rows: rows.length, profileBios: rows.filter((row) => row.hasProfileBio).length, avatars: rows.filter((row) => row.avatarUrl).length, terms: rows.filter((row) => row.memberTerm).length }));
