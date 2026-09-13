import { readFile, writeFile } from "node:fs/promises";

const [membersPath, rawArchivePath, outputPath] = process.argv.slice(2);
if (!membersPath || !rawArchivePath || !outputPath) {
  throw new Error("Usage: node scripts/build-final-discord-profile-import.mjs <members.json> <raw-archive.json> <output.json>");
}

const [members, archive] = await Promise.all([
  readFile(membersPath, "utf8").then(JSON.parse),
  readFile(rawArchivePath, "utf8").then(JSON.parse),
]);

const rank = (roles) => roles.some((role) => /プラチナ|platinum|💎/i.test(role)) ? "platinum"
  : roles.some((role) => /ゴールド|gold|🥇/i.test(role)) ? "gold"
  : roles.some((role) => /シルバー|silver|🥈/i.test(role)) ? "silver" : "regular";
const term = (roles) => {
  const match = roles.map(String).join(" ").match(/第?\s*(\d+)\s*期/);
  return match ? `第${match[1]}期` : null;
};
const text = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim();

// Only the dedicated self-introduction channel is eligible to populate a bio.
// A member's latest non-empty message wins, preserving app-authored bios unless
// there was an actual Discord self-introduction to migrate.
const introductions = new Map();
for (const channel of archive.channels ?? []) {
  if (!/自己紹介/.test(String(channel.name ?? ""))) continue;
  for (const message of channel.messages ?? []) {
    const bio = text(message.content);
    const id = String(message.authorId ?? "");
    if (!/^\d{17,20}$/.test(id) || !bio || /^(https?:\/\/|<@)/.test(bio)) continue;
    const current = introductions.get(id);
    if (!current || String(message.createdAt) > current.createdAt) introductions.set(id, { bio, createdAt: String(message.createdAt) });
  }
}

const rows = members.map((member) => {
  const discordUserId = String(member.discordUserId ?? "");
  const roles = Array.isArray(member.discordRoles) ? member.discordRoles.map(String) : [];
  const intro = introductions.get(discordUserId);
  return {
    discordUserId,
    displayName: text(member.displayName).slice(0, 120),
    avatarUrl: text(member.avatarUrl),
    bio: intro?.bio?.slice(0, 4000) ?? "",
    hasProfileBio: Boolean(intro),
    discordJoinedAt: member.discordJoinedAt ?? null,
    discordRoles: roles,
    memberTerm: term(roles),
    memberRank: rank(roles),
  };
}).filter((row) => /^\d{17,20}$/.test(row.discordUserId));

const payload = {
  confirmation: `IMPORT_DISCORD_PROFILES_${rows.length}`,
  snapshotAt: archive.exportedAt ?? null,
  rows,
};
await writeFile(outputPath, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ rows: rows.length, bios: rows.filter((row) => row.hasProfileBio).length, output: outputPath }, null, 2));
