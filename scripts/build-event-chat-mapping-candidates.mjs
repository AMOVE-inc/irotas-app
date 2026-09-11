import { readFile, writeFile } from "node:fs/promises";

const [rawPath, eventsPath, outputPath] = process.argv.slice(2);
if (!rawPath || !eventsPath || !outputPath) {
  throw new Error("Usage: node scripts/build-event-chat-mapping-candidates.mjs RAW_EVENTS EVENT_IMPORT OUTPUT");
}

const [raw, imported] = await Promise.all([rawPath, eventsPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
const normalize = (value) => String(value ?? "")
  .normalize("NFKC").toLowerCase()
  .replace(/【[^】]*】|\[[^\]]*\]|[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, " ")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();
const tokens = (value) => new Set(normalize(value).split(/\s+/).filter((token) => token.length >= 2));
const dateTokens = (date) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  return match ? {
    full: `${match[1]}${match[2]}${match[3]}`,
    monthDay: `${Number(match[2])}${String(Number(match[3])).padStart(2, "0")}`,
  } : null;
};
const score = (chat, event) => {
  const chatTokens = tokens(chat.name);
  const eventTokens = new Set([...tokens(event.event.title), ...tokens(event.event.publicData?.location)]);
  let value = 0;
  const compactChatName = String(chat.name).replace(/\D/g, "");
  const eventDate = dateTokens(event.event.eventDate);
  if (eventDate?.full && compactChatName.includes(eventDate.full)) value += 40;
  // Channel names that include a year are common. Do not use a loose month/day
  // substring here: `20260501` would otherwise incorrectly match `6/5`.
  // Undated names stay unmapped for manual review rather than risking private
  // chat content being attached to the wrong event.
  for (const token of chatTokens) if (token.length >= 3 && eventTokens.has(token)) value += token.length >= 5 ? 5 : 3;
  return value;
};
const linkedDiscordThreadIds = (messages) => new Set(
  messages.flatMap((message) => [...String(message.content ?? "").matchAll(
    /https?:\/\/(?:discord(?:app)?\.com)\/channels\/\d+\/(\d+)(?:\/\d+)?/g,
  )].map((match) => match[1])),
);

const eventChats = (raw.channels ?? []).filter((channel) =>
  channel.type === "TextChannel" && /プライベートチャット/.test(String(channel.categoryName ?? "")),
).map((channel) => ({
  sourceChannelId: String(channel.id),
  name: String(channel.name),
  categoryName: String(channel.categoryName),
  messageCount: (channel.messages ?? []).length,
  attachmentCount: (channel.messages ?? []).reduce((total, message) => total + (message.attachments ?? []).length, 0),
  authorDiscordUserIds: [...new Set((channel.messages ?? []).map((message) => String(message.authorId ?? "")).filter(Boolean))],
  linkedDiscordThreadIds: [...linkedDiscordThreadIds(channel.messages ?? [])],
}));
const events = imported.events ?? [];
const mapping = eventChats.map((chat) => ({
  ...chat,
  candidates: events.map((event) => ({
    eventId: `discord-event-${event.sourceThreadId}`,
    title: event.event.title,
    date: event.event.eventDate,
    // A Discord event thread URL in a private chat is an exact source reference,
    // and is safer than inferring from a similar event name or date.
    score: chat.linkedDiscordThreadIds.includes(String(event.sourceThreadId)) ? 100 : score(chat, event),
    directSourceLink: chat.linkedDiscordThreadIds.includes(String(event.sourceThreadId)),
  })).filter((candidate) => candidate.directSourceLink || candidate.score >= 43)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .filter((candidate, index, all) => index === all.findIndex((other) => other.eventId === candidate.eventId))
    .slice(0, 3),
}));

const output = {
  snapshotAt: raw.exportedAt,
  policy: "Candidates do not grant chat access. Only an explicit event mapping may import messages into an event room, whose access continues to be enforced by existing event participation.",
  totals: { eventChats: mapping.length, messages: mapping.reduce((sum, chat) => sum + chat.messageCount, 0), withCandidate: mapping.filter((chat) => chat.candidates.length > 0).length },
  chats: mapping,
};
await writeFile(outputPath, JSON.stringify(output, null, 2), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify(output.totals));
