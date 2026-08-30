import fs from "node:fs";

const input = JSON.parse(fs.readFileSync(new URL("../data/discord-board-2026-08-29.json", import.meta.url), "utf8"));
const categories = new Set(["official-event", "branch-event-kanto", "branch-event-kansai", "gourmet-board-kanto", "gourmet-board-kansai"]);
const profileFlagIndex = process.argv.indexOf("--profiles");
const profileImportPath = profileFlagIndex >= 0 ? process.argv[profileFlagIndex + 1] : "";
const profiles = fs.existsSync(profileImportPath)
  ? new Map(JSON.parse(fs.readFileSync(profileImportPath, "utf8")).rows.map((row) => [row.discordUserId, row]))
  : new Map();

function cleanTitle(value) {
  return value
    .replace(/^(?:【[^】]*(?:募集|終了|告知|アンケート|日程)[^】]*】\s*)+/, "")
    .replace(/\d{4}[年\-/]\d{1,2}[月\-/]\d{1,2}日?/g, " ")
    .replace(/\d{1,2}[\/月]\d{1,2}(?:日)?(?:\s*[〜~～-]\s*\d{1,2}(?:日)?)?/g, " ")
    .replace(/\d{1,2}[\/月]\d{1,2}(?:日)?(?:\s*[（(][^）)]*[）)])?/g, " ")
    .replace(/[（(]\s*(?:月|火|水|木|金|土|日)(?:曜日)?\s*[）)]/g, " ")
    .replace(/(?:[01]?\d|2[0-3])[:：時][0-5]?\d?(?:分)?(?:[〜~～-](?:[01]?\d|2[0-3])[:：時][0-5]?\d?(?:分)?)?/g, " ")
    .replace(/^[\s~～—―・:：-]+|[\s~～—―・:：-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[〜~～\-–—―]+\s*/, "")
    .trim();
}

function priceFrom(thread) {
  const lines = thread.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const label = /(?:予算|参加費|費用|会費|料金|金額)\s*[：:]/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(label);
    if (!match) continue;
    const sameLine = lines[index].slice((match.index ?? 0) + match[0].length).replace(/^\*+|\*+$/g, "").trim();
    const value = sameLine || lines[index + 1]?.replace(/^\*+|\*+$/g, "").trim();
    if (value) return value.slice(0, 100);
  }
  const inline = thread.content.match(/(?:参加費|会費|料金)\s*(?:は)?\s*([¥￥]?\s*[\d,]+(?:\s*[〜~～-]\s*[¥￥]?\s*[\d,]+)?\s*円?(?:前後|程度|ほど)?|無料)/);
  return inline?.[1]?.trim() || "本文をご確認ください";
}

function priceRange(value) {
  if (/無料/.test(value)) return { priceMin: 0, priceMax: 0 };
  const amounts = [...value.matchAll(/[\d,]+/g)].map((match) => Number(match[0].replaceAll(",", ""))).filter(Number.isFinite);
  if (!amounts.length) return {};
  return { priceMin: amounts[0], priceMax: amounts[1] ?? amounts[0] };
}

function dateFrom(thread) {
  const text = `${thread.title}\n${thread.content}`;
  const match = text.match(/(?:^|[^0-9])(\d{1,2})\s*[\/月]\s*(\d{1,2})(?:\s*日)?/);
  return match ? `2026-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}` : thread.createdAt.slice(0, 10);
}

function timeFrom(thread) {
  const match = `${thread.title}\n${thread.content}`.match(/(?:^|\s)([01]?\d|2[0-3])[:：時]([0-5]\d)?/);
  return match ? `${String(match[1]).padStart(2, "0")}:${match[2] ?? "00"}` : "時間未定";
}

function locationFrom(thread) {
  const text = `${thread.title}\n${thread.content}`;
  const at = thread.title.match(/[@＠]([^\s｜|]+)/);
  const labeled = text.match(/(?:開催場所|場所|会場|エリア)\s*[：:]\s*([^\n]+)/);
  return (at?.[1] ?? labeled?.[1] ?? "詳細をご確認ください").trim();
}

function externalLinksFrom(thread) {
  const text = `${thread.title}\n${thread.content}`;
  const urls = [...text.matchAll(/https?:\/\/[^\s<>\]\[）)]+/g)].map((match) => match[0].replace(/[、。,.]+$/g, ""));
  return {
    tabelogUrl: urls.find((url) => /(^|\.)tabelog\.com\//i.test(new URL(url).hostname + "/")),
    googleMapsUrl: urls.find((url) => /(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[^/]+\/maps|maps\.google\.)/i.test(url)),
  };
}

function completeThread(thread) {
  return thread;
}

function cleanDisplayName(value) {
  return value.replace(/\s*【\s*(?:🥈\s*)?SILVER\s*】/gi, "").replace(/\s*【\s*(?:🥇\s*)?GOLD\s*】/gi, "").replace(/\s*【\s*(?:💎\s*)?PLATINUM\s*】/gi, "").trim();
}

const clubEvent = (thread) => thread.category.startsWith("club-club-") && (/募集|開催|交流会|鑑賞会|食事会|ご飯会|飲み会|ツアー|合宿|イベント/.test(thread.title) || /\d{1,2}\s*[\/月]\s*\d{1,2}/.test(thread.title));
const eventThreads = input.threads.filter((thread) => categories.has(thread.category) || clubEvent(thread));
const seenTitles = new Set();
const events = eventThreads.map((rawThread) => {
  const thread = completeThread(rawThread);
  const official = thread.category === "official-event" || thread.category.startsWith("branch-event-");
  const club = thread.category.startsWith("club-club-");
  const kansai = thread.category.endsWith("kansai");
  const closed = /募集終了/.test(thread.title);
  const authorProfile = profiles.get(thread.authorId);
  const links = externalLinksFrom(thread);
  const price = priceFrom(thread);
  return {
    id: `discord-event-${thread.id.replace(/^discord-board-/, "")}`,
    createdAt: thread.createdAt,
    title: cleanTitle(thread.title) || thread.sourceLabel || "イベント",
    description: thread.content,
    date: dateFrom(thread),
    time: timeFrom(thread),
    location: locationFrom(thread),
    image: thread.images?.[0] ?? "",
    ...links,
    capacity: 1,
    attendees: 0,
    participants: [],
    applicantIds: [],
    price,
    ...priceRange(price),
    category: kansai ? "kansai" : official && thread.category === "official-event" ? "all" : "kanto",
    eventType: club ? "club" : official ? "official" : "gourmet",
    ...(club ? { clubId: thread.category.replace(/^club-/, "") } : {}),
    status: closed ? "full" : "open",
    createdBy: "u1",
    organizerProfileId: `discord-${thread.authorId}`,
    organizerName: cleanDisplayName(authorProfile?.displayName || thread.authorName || "メンバー"),
    organizerAvatar: authorProfile?.avatarUrl || undefined,
    organizerRank: authorProfile?.memberRank || undefined,
    sourceThreadId: thread.id,
    sourceLabel: thread.sourceLabel,
  };
}).filter((event) => !["支部イベント🥂年間予定📅", "全体パーティー🎊年間予定📅"].includes(event.title)).filter((event) => {
  const key = `${event.date}:${event.title.normalize("NFKC").replace(/[\s・]/g, "").toLowerCase()}`;
  if (seenTitles.has(key)) return false;
  seenTitles.add(key);
  return true;
});

const output = `/* This file is generated by scripts/build-discord-event-import.mjs. */\nexport const IMPORTED_DISCORD_EVENTS = ${JSON.stringify(events, null, 2)};\n`;
fs.writeFileSync(new URL("../constants/imported-discord-events.ts", import.meta.url), output);
console.log(`generated ${events.length} Discord events`);
