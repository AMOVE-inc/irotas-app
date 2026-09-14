import { readFile, writeFile } from "node:fs/promises";

const [rawPath, outputPath] = process.argv.slice(2);
if (!rawPath || !outputPath) throw new Error("Usage: node scripts/build-final-discord-board-archive.mjs <raw.json> <output.json>");
const source = JSON.parse(await readFile(rawPath, "utf8"));

const categoryByForum = new Map([
  ["🎉｜全体イベント", "official-event"], ["🗼｜関東支部", "branch-event-kanto"], ["🐙｜関西支部", "branch-event-kansai"],
  ["🍴｜関東グルメ掲示板", "gourmet-board-kanto"], ["🥂｜関西グルメ掲示板", "gourmet-board-kansai"],
  ["💬｜なんでも掲示板", "free-chat"], ["👑｜グルメ選手権", "gourmet-contest"], ["🙋‍♀️｜おしえてグルメ相談室", "gourmet-advice"],
  ["🎁｜プレゼント企画", "gift-campaign"], ["📸｜活動報告", "club-all"],
  ["🍷｜ワイン部", "club-club-wine"], ["🍞｜パン部", "club-club-bread"], ["🚶｜散歩部", "club-club-walk"], ["🏃｜ランニング部", "club-club-running"],
  ["✈️｜旅行部", "club-club-travel"], ["⚾｜スポーツ観戦部", "club-club-sports-viewing"], ["🎞️｜映画・ドラマ鑑賞部", "club-club-movie"], ["🐭｜ディズニー部", "club-club-disney"],
  ["🍰｜スイーツ部", "club-club-sweets"], ["🍳｜料理教室部", "club-club-cooking"], ["🍺｜昼飲み部", "club-club-day-drinking"], ["🎭｜舞台鑑賞部", "club-club-stage"],
  ["🏀｜スポーツ部", "club-club-sports"], ["⛳｜ゴルフ部", "club-club-golf"], ["🍖｜肉部", "club-club-meat"],
]);
const imageUrls = (message) => (message.attachments ?? []).filter((attachment) => /^image\//.test(String(attachment.contentType ?? ""))).map((attachment) => attachment.url).filter(Boolean);
const toRecord = (message) => ({
  id: String(message.id), authorId: String(message.authorId ?? ""), authorName: String(message.authorName ?? "未設定"), authorAvatarUrl: "", content: String(message.content ?? ""),
  createdAt: String(message.createdAt), parentMessageId: message.parentMessageId ?? null, images: imageUrls(message), videos: [], reactions: message.reactions ?? null,
});
const threads = [];
const comments = [];
for (const channel of source.channels ?? []) {
  const category = categoryByForum.get(String(channel.name ?? ""));
  if (!category) continue;
  for (const thread of channel.threads ?? []) {
    const messages = (thread.messages ?? []).filter((message) => message.content || (message.attachments ?? []).length).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const starter = messages[0];
    if (!starter) continue;
    const id = `discord-board-${thread.id}`;
    threads.push({ ...toRecord(starter), id, category, title: String(thread.name || starter.content || "投稿").slice(0, 200), sourceLabel: String(channel.name), sourceThreadId: String(thread.id) });
    for (const message of messages.slice(1)) comments.push({ ...toRecord(message), id: `discord-comment-${message.id}`, threadId: id });
  }
}
threads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const archive = { exportedAt: source.exportedAt, source: "discord-final-2026-09-11", threads, comments };
await writeFile(outputPath, JSON.stringify(archive), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ threads: threads.length, comments: comments.length, categories: [...new Set(threads.map((thread) => thread.category))].length }, null, 2));
