import { readFile, writeFile } from "node:fs/promises";

const [rawPath, candidatesPath, outputPath] = process.argv.slice(2);
if (!rawPath || !candidatesPath || !outputPath) throw new Error("Usage: node scripts/build-approved-event-chat-import.mjs RAW CANDIDATES OUTPUT");
const [raw, candidates] = await Promise.all([rawPath, candidatesPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
const byId = new Map((raw.channels ?? []).map((channel) => [String(channel.id), channel]));
const dateInChannelName = (name) => {
  const matched = String(name).match(/(20\d{2})(\d{2})(\d{2})/);
  return matched ? `${matched[1]}-${matched[2]}-${matched[3]}` : null;
};
const chats = (candidates.chats ?? []).flatMap((candidate) => {
  // Only accept a source-thread URL emitted by Discord itself. Where several
  // source links occur in a private chat, the embedded YYYYMMDD must narrow
  // those direct links to exactly one matching event date. Name/date scoring
  // alone remains human-review-only and never grants private-chat access.
  const directMatches = (candidate.candidates ?? []).filter((entry) => entry.directSourceLink);
  const channelDate = dateInChannelName(candidate.name);
  const dateResolved = channelDate
    ? directMatches.filter((entry) => entry.date === channelDate)
    : [];
  const match = directMatches.length === 1
    ? directMatches[0]
    : dateResolved.length === 1
      ? dateResolved[0]
      : null;
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
