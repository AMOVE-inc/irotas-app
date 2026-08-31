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
  const label = /(?:予算|参加費|費用|会費|料金|金額)(?:\s*[：:=＝]\s*|\s+|$)/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(label);
    if (!match) continue;
    const sameLine = lines[index].slice((match.index ?? 0) + match[0].length).replace(/^\*+|\*+$/g, "").trim();
    const value = sameLine || lines[index + 1]?.replace(/^\*+|\*+$/g, "").trim();
    if (value) return canonicalPrice(value);
  }
  const inline = thread.content.match(/(?:参加費|会費|料金)\s*(?:は)?\s*([¥￥]?\s*[\d,]+(?:\s*[〜~～-]\s*[¥￥]?\s*[\d,]+)?\s*円?(?:前後|程度|ほど)?|無料)/);
  return inline?.[1] ? canonicalPrice(inline[1]) : "本文をご確認ください";
}

function canonicalPrice(value) {
  if (/無料/.test(value)) return "無料";
  const range = value.match(/[¥￥]?\s*([\d,]+)\s*(?:円)?\s*[〜~～\-–—]\s*[¥￥]?\s*([\d,]+)\s*(?:円)?/);
  if (range) return `${Number(range[1].replaceAll(",", "")).toLocaleString("ja-JP")}〜${Number(range[2].replaceAll(",", "")).toLocaleString("ja-JP")}円`;
  const amount = value.match(/[¥￥]?\s*([\d,]+)\s*(?:円)?/);
  return amount ? `${Number(amount[1].replaceAll(",", "")).toLocaleString("ja-JP")}円` : "本文をご確認ください";
}

function priceRange(value) {
  if (/無料/.test(value)) return { priceMin: 0, priceMax: 0 };
  const amounts = [...value.matchAll(/[\d,]+/g)].map((match) => Number(match[0].replaceAll(",", ""))).filter(Number.isFinite);
  if (!amounts.length) return {};
  return { priceMin: amounts[0], priceMax: amounts[1] ?? amounts[0] };
}

function dateFrom(thread) {
  const text = `${thread.title}\n${thread.content}`;
  const explicit = text.match(/(?:^|[^0-9])(20\d{2})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})(?:\s*日)?/);
  if (explicit) return `${explicit[1]}-${String(explicit[2]).padStart(2, "0")}-${String(explicit[3]).padStart(2, "0")}`;
  const match = text.match(/(?:^|[^0-9])(\d{1,2})\s*[\/月]\s*(\d{1,2})(?:\s*日)?/);
  if (!match) return thread.createdAt.slice(0, 10);
  const created = new Date(thread.createdAt);
  const month = Number(match[1]);
  let year = created.getUTCFullYear();
  // 年末に翌年イベントを告知した場合だけ年を繰り上げる。過去投稿を一律2026年にしない。
  if (created.getUTCMonth() + 1 - month >= 7) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
}

function timeFrom(thread) {
  const match = `${thread.title}\n${thread.content}`.match(/(?:^|[^0-9])([01]?\d|2[0-3])[:：時]([0-5]\d)?/);
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

function capacityFrom(thread) {
  const text = `${thread.title}\n${thread.content}`;
  const labeled = text.match(/(?:募集人数|募集定員|定員)(?:\s*[（(]幹事除く[）)])?\s*[：:=]?\s*(?:抽選で|先着)?\s*(\d+)\s*名/);
  const capacity = Math.max(1, Number(labeled?.[1] ?? 1));
  const total = text.match(/(?:私|幹事)(?:を含(?:む|め)|の)?(?:計|合計)?\s*(\d+)\s*名|(?:計|合計)\s*(\d+)\s*名/);
  const reservationCapacity = Math.max(capacity, Number(total?.[1] ?? total?.[2] ?? capacity + (thread.category.startsWith("gourmet-board-") ? 1 : 0)));
  return { capacity, reservationCapacity };
}

function completeThread(thread) {
  const normalizedTitle = thread.title.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const normalizedContent = thread.content.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  if (normalizedContent !== normalizedTitle) return thread;
  const candidate = input.comments
    .filter((comment) => comment.threadId === thread.id && comment.content?.trim())
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .find((comment) => comment.authorId === thread.authorId && (comment.content.includes("\n") || comment.content.length >= 80));
  return candidate ? { ...thread, content: candidate.content, images: thread.images?.length ? thread.images : candidate.images } : thread;
}

function cleanDisplayName(value) {
  return value.replace(/\s*【\s*(?:🥈\s*)?SILVER\s*】/gi, "").replace(/\s*【\s*(?:🥇\s*)?GOLD\s*】/gi, "").replace(/\s*【\s*(?:💎\s*)?PLATINUM\s*】/gi, "").trim();
}

function rankFromDisplayName(value = "") {
  if (/PLATINUM|プラチナ/i.test(value)) return "platinum";
  if (/GOLD|ゴールド/i.test(value)) return "gold";
  if (/SILVER|シルバー/i.test(value)) return "silver";
  return undefined;
}

function confirmedParticipantsFor(thread) {
  const comments = input.comments
    .filter((comment) => comment.threadId === thread.id)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  let confirmed = [];
  let chatId;
  const ambiguousCancellations = [];
  for (const comment of comments) {
    const mentions = Array.isArray(comment.mentions) ? comment.mentions.filter((item) => /^\d{17,20}$/.test(item.id)) : [];
    const isConfirmation = /(?:作成しました|今回は下記|下記(?:の)?(?:皆様|メンバー)|ご一緒(?:できれば|お願いします)|参加者.*確定)/.test(comment.content);
    if (isConfirmation && mentions.length) {
      confirmed = mentions.map((item) => `discord-${item.id}`);
      chatId = comment.content.match(/<#(\d{17,20})>/)?.[1] ?? chatId;
    }
    if (/キャンセル/.test(comment.content) && confirmed.length) {
      if (mentions.length) {
        const cancelled = new Set(mentions.map((item) => `discord-${item.id}`));
        confirmed = confirmed.filter((id) => !cancelled.has(id));
      } else {
        ambiguousCancellations.push({ createdAt: comment.createdAt, content: comment.content.slice(0, 180) });
      }
    }
  }
  // A cancellation without a named member cannot be reconciled safely. Leave the
  // participant list unapplied until an operator confirms the replacement.
  if (ambiguousCancellations.length) confirmed = [];
  return { participants: [...new Set(confirmed)], chatId, ambiguousCancellations };
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
  const capacity = capacityFrom(thread);
  const date = dateFrom(thread);
  const confirmation = closed && date >= new Date().toISOString().slice(0, 10)
    ? confirmedParticipantsFor(thread)
    : { participants: [], chatId: undefined, ambiguousCancellations: [] };
  const reconciledCapacity = {
    capacity: Math.max(capacity.capacity, confirmation.participants.length),
    reservationCapacity: Math.max(capacity.reservationCapacity, confirmation.participants.length),
  };
  return {
    id: `discord-event-${thread.id.replace(/^discord-board-/, "")}`,
    createdAt: thread.createdAt,
    title: cleanTitle(thread.title) || thread.sourceLabel || "イベント",
    description: thread.content,
    date,
    time: timeFrom(thread),
    location: locationFrom(thread),
    image: thread.images?.[0] ?? "",
    ...links,
    ...reconciledCapacity,
    attendees: confirmation.participants.length,
    participants: confirmation.participants,
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
    organizerAvatar: authorProfile?.avatarUrl || thread.authorAvatarUrl || "",
    organizerRank: authorProfile?.memberRank || rankFromDisplayName(thread.authorName),
    sourceThreadId: thread.id,
    sourceLabel: thread.sourceLabel,
    ...(confirmation.chatId ? { chatId: `discord-${confirmation.chatId}` } : {}),
    ...(confirmation.ambiguousCancellations.length ? { participantImportWarnings: confirmation.ambiguousCancellations } : {}),
  };
}).filter((event) => !["支部イベント🥂年間予定📅", "全体パーティー🎊年間予定📅", "秋合宿 運営メンバー募集🍁✨"].includes(event.title)).filter((event) => {
  const key = `${event.date}:${event.title.normalize("NFKC").replace(/[\s・]/g, "").toLowerCase()}`;
  if (seenTitles.has(key)) return false;
  seenTitles.add(key);
  return true;
});

const output = `/* This file is generated by scripts/build-discord-event-import.mjs. */\nexport const IMPORTED_DISCORD_EVENTS = ${JSON.stringify(events, null, 2)};\n`;
fs.writeFileSync(new URL("../constants/imported-discord-events.ts", import.meta.url), output);
console.log(`generated ${events.length} Discord events`);
