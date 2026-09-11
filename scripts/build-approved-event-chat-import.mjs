import { readFile, writeFile } from "node:fs/promises";

const [rawPath, candidatesPath, outputPath] = process.argv.slice(2);
if (!rawPath || !candidatesPath || !outputPath) throw new Error("Usage: node scripts/build-approved-event-chat-import.mjs RAW CANDIDATES OUTPUT");
const [raw, candidates] = await Promise.all([rawPath, candidatesPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
const byId = new Map((raw.channels ?? []).map((channel) => [String(channel.id), channel]));
const chats = (candidates.chats ?? []).flatMap((candidate) => {
  const match = candidate.candidates?.length === 1 && candidate.candidates[0].score >= 43 && candidate.candidates[0].textScore >= 3
    ? candidate.candidates[0] : null;
  const source = byId.get(String(candidate.sourceChannelId));
  if (!match || !source) return [];
  return [{
    sourceChannelId: String(source.id), eventId: match.eventId, name: String(source.name),
    messages: (source.messages ?? []).filter((message) => message.content || (message.attachments ?? []).length).map((message) => ({
      sourceMessageId: String(message.id), authorDiscordUserId: String(message.authorId ?? ""),
      content: String(message.content ?? ""), createdAt: String(message.createdAt),
      imageUrls: (message.attachments ?? []).filter((attachment) => /^image\//.test(String(attachment.contentType ?? ""))).map((attachment) => String(attachment.url)).filter(Boolean),
      reactions: message.reactions ?? {},
    })),
  }];
});
const output = { confirmation: `APPLY_${chats.length}_EVENT_CHATS`, chats };
await writeFile(outputPath, JSON.stringify(output, null, 2), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ chats: chats.length, messages: chats.reduce((sum, chat) => sum + chat.messages.length, 0) }));
