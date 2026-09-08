import { DISCORD_AUTHOR_DIRECTORY } from "@/constants/discord-author-directory";

export type DiscordAuthor = (typeof DISCORD_AUTHOR_DIRECTORY)[number];

const authorsById = new Map<string, DiscordAuthor>(DISCORD_AUTHOR_DIRECTORY.map((author) => [author.id, author]));
const authorsByName = new Map<string, DiscordAuthor>();

function normalizedName(value: string) {
  return value.normalize("NFKC")
    .replace(/【[^】]+】|\([^)]*(?:regular|silver|gold|platinum|レギュラー|シルバー|ゴールド|プラチナ)[^)]*\)/gi, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]\s*[^\s【】]{1,20}部長$/u, "")
    .trim();
}

for (const author of DISCORD_AUTHOR_DIRECTORY) authorsByName.set(normalizedName(author.name), author);

export function getDiscordAuthorById(id: string | undefined) {
  return id ? authorsById.get(id.startsWith("discord-") ? id : `discord-${id}`) : undefined;
}

export function getDiscordAuthorByName(name: string) {
  return authorsByName.get(normalizedName(name));
}
