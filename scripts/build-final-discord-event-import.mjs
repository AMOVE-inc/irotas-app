import { readFile, writeFile } from "node:fs/promises";

const [archivePath, outputPath] = process.argv.slice(2);
if (!archivePath || !outputPath) throw new Error("Usage: node scripts/build-final-discord-event-import.mjs <board-archive.json> <output.json>");
const archive = JSON.parse(await readFile(archivePath, "utf8"));
const eventCategories = new Set(["official-event", "branch-event-kanto", "branch-event-kansai"]);
const text = (value) => String(value ?? "").trim();
const dateFrom = (thread) => {
  const value = `${thread.title}\n${thread.content}`;
  const full = value.match(/(20\d{2})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})/);
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  const short = value.match(/(?:^|[^\d])(\d{1,2})\s*[月/]\s*(\d{1,2})(?:日)?/);
  const created = new Date(thread.createdAt);
  if (!short || Number.isNaN(created.valueOf())) return thread.createdAt.slice(0, 10);
  const month = Number(short[1]);
  let year = created.getUTCFullYear();
  if (created.getUTCMonth() + 1 - month >= 7) year += 1;
  return `${year}-${String(month).padStart(2, "0")}-${short[2].padStart(2, "0")}`;
};
const timeFrom = (thread) => {
  const match = `${thread.title}\n${thread.content}`.match(/(?:^|[^\d])([01]?\d|2[0-3])[:：時]([0-5]\d)?/);
  return match ? `${String(match[1]).padStart(2, "0")}:${match[2] ?? "00"}` : "時間未定";
};
const urls = (thread) => [...`${thread.content}`.matchAll(/https?:\/\/[^\s<>]+/g)].map((match) => match[0].replace(/[、。,.]+$/g, ""));
const locationFrom = (thread) => {
  const value = `${thread.title}\n${thread.content}`;
  return value.match(/(?:開催場所|場所|会場|エリア)\s*[：:]\s*([^\n]+)/)?.[1]?.trim() || thread.title.match(/[@＠]([^\s｜|]+)/)?.[1] || "詳細をご確認ください";
};
const capacityFrom = (thread) => Math.max(1, Number(`${thread.content}`.match(/(?:募集人数|募集定員|定員)\s*[：:=]?\s*(\d+)\s*名/)?.[1] ?? 1));

const events = archive.threads
  .filter((thread) => eventCategories.has(thread.category))
  .map((thread) => {
    const eventDate = dateFrom(thread);
    const eventType = thread.category === "official-event" ? "official" : "gourmet";
    const links = urls(thread);
    const capacity = capacityFrom(thread);
    return {
      sourceThreadId: String(thread.sourceThreadId ?? thread.id).replace(/^discord-board-/, ""),
      organizerDiscordUserId: /^\d{17,20}$/.test(String(thread.authorId ?? "")) ? String(thread.authorId) : undefined,
      event: {
        title: text(thread.title).slice(0, 160) || "Discord移行イベント",
        eventDate,
        eventType,
        // Discord上で募集中だったイベントも、移行後に二重募集しないよう履歴
        // としてのみ登録する。新規募集はアプリで新規作成したものだけにする。
        status: "ended",
        publicData: {
          description: text(thread.content), time: timeFrom(thread), location: locationFrom(thread), capacity, reservationCapacity: capacity + 1,
          images: Array.isArray(thread.images) ? thread.images : [],
          googleMapsUrl: links.find((url) => /(?:maps\.app\.goo\.gl|google\.[^/]+\/maps|maps\.google\.)/i.test(url)) ?? "",
          tabelogUrl: links.find((url) => /tabelog\.com/i.test(url)) ?? "",
          archivedFromDiscord: true,
          sourceChannel: thread.sourceLabel,
        },
      },
    };
  });
const payload = { snapshotAt: archive.exportedAt, confirmation: `APPLY_${events.length}_EVENTS`, events };
await writeFile(outputPath, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ events: events.length, official: events.filter((item) => item.event.eventType === "official").length, branch: events.filter((item) => item.event.eventType === "gourmet").length }, null, 2));
