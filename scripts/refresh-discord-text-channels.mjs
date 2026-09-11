/**
 * Refresh the two Discord text channels that are intentionally represented as
 * board entries (自己紹介・今日のごちそうさま報告). This uses Discord's REST
 * pagination instead of gateway history, so the final cutover is reliable
 * even when the gateway is still syncing a large server.
 */
import { readFile, writeFile } from "node:fs/promises";

const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath) throw new Error("Usage: node scripts/refresh-discord-text-channels.mjs CONFIG OUTPUT");

const config = await readFile(configPath, "utf8");
const token = config.match(/^bot_token:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
if (!token) throw new Error("Discord bot token was not found in config");

const channels = [
  { id: "1217327152643575911", category: "introduction", label: "自己紹介" },
  { id: "1468128865552568342", category: "meal-report", label: "今日のごちそうさま報告" },
];
const headers = { authorization: `Bot ${token}` };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function attachments(message) {
  return (message.attachments ?? [])
    .filter((item) => String(item.content_type ?? "").startsWith("image/"))
    .map((item) => item.url)
    .filter(Boolean);
}

function field(content, labels) {
  const match = content.split(/\r?\n/).map((line) => line.replace(/^[\s*#・■●◆\-📍📌👥💰💵💬🍴🍽️⭐🌟🥢]+/, "").trim()).find((line) => labels.some((label) => new RegExp(`^${label}\\s*[：:]\\s*(.+)$`).test(line)));
  return match?.replace(/^[^：:]+[：:]\s*/, "").trim();
}

function mealReport(content) {
  const first = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "過去のごちそうさま報告";
  const stars = Math.min(5, Math.max(content.match(/[⭐★]/g)?.length ?? 0, 0));
  return {
    restaurantName: field(content, ["店名", "お店", "店舗名"]) ?? first,
    prefecture: ["東京都", "大阪府", "愛知県", "神奈川県", "千葉県", "埼玉県", "兵庫県", "京都府"].find((value) => content.includes(value)) ?? "",
    areaDisplay: field(content, ["場所", "エリア", "所在地"]), budget: field(content, ["予算", "価格帯"]),
    recommendedMenu: field(content, ["おすすめメニュー", "メニュー", "商品名"]), rating: stars,
    comment: field(content, ["感想", "ひとこと", "一言", "コメント", "推しポイント"]),
  };
}

async function fetchChannel(channel) {
  const result = [];
  let before = "";
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (before) query.set("before", before);
    const response = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages?${query}`, { headers });
    if (response.status === 429) { const body = await response.json(); await sleep(Math.ceil(Number(body.retry_after ?? 1) * 1000)); continue; }
    if (!response.ok) throw new Error(`${channel.label}: Discord returned ${response.status}`);
    const page = await response.json();
    result.push(...page);
    before = page.at(-1)?.id ?? "";
    if (page.length < 100) break;
    await sleep(250);
  } while (before);
  return result;
}

const threads = [];
const comments = [];
for (const channel of channels) {
  const messages = await fetchChannel(channel);
  for (const message of messages) {
    if (message.author?.bot || (!message.content && !(message.attachments ?? []).length)) continue;
    const id = `discord-board-${message.id}`;
    const base = { id, authorId: String(message.author?.id ?? ""), authorName: message.member?.nick ?? message.author?.global_name ?? message.author?.username ?? "未設定", authorAvatarUrl: message.author?.avatar ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png` : "", content: message.content ?? "", createdAt: message.timestamp, parentMessageId: message.message_reference?.message_id ?? null, images: attachments(message), videos: [], reactions: Object.fromEntries((message.reactions ?? []).map((reaction) => [reaction.emoji?.name ?? "リアクション", { count: reaction.count, users: null }])), };
    if (base.parentMessageId) { comments.push({ ...base, id: `discord-comment-${message.id}`, threadId: `discord-board-${base.parentMessageId}` }); continue; }
    threads.push({ ...base, category: channel.category, title: channel.category === "introduction" ? "自己紹介" : mealReport(base.content).restaurantName, ...(channel.category === "introduction" ? { selfIntroduction: { introduction: base.content } } : { mealReport: mealReport(base.content) }), sourceLabel: channel.label });
  }
}
threads.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
comments.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
await writeFile(outputPath, JSON.stringify({ exportedAt: new Date().toISOString(), threads, comments }));
console.log(JSON.stringify({ threads: threads.length, comments: comments.length }));
