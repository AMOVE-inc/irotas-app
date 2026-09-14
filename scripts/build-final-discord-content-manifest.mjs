import { readFile, writeFile } from "node:fs/promises";

const [rawPath, outputPath] = process.argv.slice(2);
if (!rawPath || !outputPath) throw new Error("Usage: node scripts/build-final-discord-content-manifest.mjs <raw.json> <output.json>");
const source = JSON.parse(await readFile(rawPath, "utf8"));

const eventName = /^(?:開催中止[-ー]?|※(?:中止|不開催)※)?\d{6,8}|(?:イベント|交流会|合宿|ランチ|ディナー|飲み|会)$/u;
const boardName = /掲示板|ごちそうさま|グルメ選手権|相談室|グルメマップ|プレゼント企画|活動報告/u;
const isEventChannel = (channel) => {
  const name = String(channel.name ?? "");
  return channel.type === "TextChannel" && eventName.test(name) && !boardName.test(name);
};
const countMessages = (channel) => (channel.messages ?? []).length + (channel.threads ?? []).reduce((sum, thread) => sum + (thread.messages ?? []).length, 0);
const channelRow = (channel) => ({
  sourceChannelId: String(channel.id),
  sourceName: String(channel.name),
  sourceType: String(channel.type),
  categoryName: channel.categoryName ?? null,
  threadCount: (channel.threads ?? []).length,
  messageCount: countMessages(channel),
  attachmentCount: [ ...(channel.messages ?? []), ...(channel.threads ?? []).flatMap((thread) => thread.messages ?? []) ].reduce((sum, message) => sum + (message.attachments ?? []).length, 0),
});

const sourceChannels = (source.channels ?? []).filter((channel) => !channel.unavailable && !channel.unsupported && channel.type !== "CategoryChannel");
const eventChats = sourceChannels.filter(isEventChannel).map(channelRow);
const forumBoards = sourceChannels.filter((channel) => channel.type === "ForumChannel").map(channelRow);
const textBoards = sourceChannels.filter((channel) => channel.type === "TextChannel" && !isEventChannel(channel)).map(channelRow);
const manifest = {
  schemaVersion: 1,
  snapshotAt: source.exportedAt,
  sourceGuildId: source.guildId,
  rules: {
    eventIds: "discord-event-{sourceThreadOrChannelId}",
    boardThreadIds: "discord-board-{sourceThreadId}",
    commentIds: "discord-comment-{sourceMessageId}",
    chatMessageIds: "discord-chat-{sourceMessageId}",
    idempotency: "source IDs are preserved; an existing ID is updated only by an explicit safe-merge importer",
  },
  eventChats,
  forumBoards,
  textBoards,
  totals: {
    eventChats: eventChats.length,
    eventChatMessages: eventChats.reduce((sum, channel) => sum + channel.messageCount, 0),
    forumBoards: forumBoards.length,
    forumThreads: forumBoards.reduce((sum, channel) => sum + channel.threadCount, 0),
    forumMessages: forumBoards.reduce((sum, channel) => sum + channel.messageCount, 0),
    textBoards: textBoards.length,
    textBoardMessages: textBoards.reduce((sum, channel) => sum + channel.messageCount, 0),
  },
};
await writeFile(outputPath, JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify(manifest.totals, null, 2));
