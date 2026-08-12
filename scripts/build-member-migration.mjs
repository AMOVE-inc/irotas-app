import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

function decode(path, bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function parseDelimited(text, separator) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { field += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === separator && !quoted) { row.push(field); field = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((value) => value.trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

const emailKey = (value = "") => value.trim().toLowerCase();
const splitList = (value = "") => value.split(/,\s*/).map((part) => part.trim()).filter(Boolean);
const isoDate = (value = "") => {
  const match = value.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
};
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function subscriptionPriority(row) {
  return ({ "有効": 4, "キャンセルを保留中": 3, "一時停止中": 2, "キャンセル済み": 1 }[row["ステータス"]] ?? 0) * 1e15
    + Date.parse(row["作成日"] || "1970-01-01");
}

function squareStatus(value) {
  return ({ "有効": "ACTIVE", "キャンセルを保留中": "ACTIVE", "一時停止中": "PAUSED", "キャンセル済み": "CANCELED" }[value] ?? "UNKNOWN");
}

function memberTerm(planName = "") {
  const match = planName.normalize("NFKC").match(/第\s*(\d+)\s*期/);
  return match ? `第${match[1]}期` : "";
}

function memberRank(roleNames) {
  const rank = roleNames.find((name) => /プラチナ|ゴールド|シルバー|レギュラー/i.test(name));
  return rank?.replace(/会員/g, "").trim() ?? "レギュラー";
}

async function load(path) {
  const bytes = await readFile(path);
  const text = decode(path, bytes);
  const firstLine = text.split(/\r?\n/, 1)[0];
  return parseDelimited(text, firstLine.includes("\t") ? "\t" : ",");
}

const [subscriptionsPath, membersPath, customersPath, outputPath] = process.argv.slice(2);
if (!subscriptionsPath || !membersPath || !customersPath || !outputPath) {
  console.error("Usage: node scripts/build-member-migration.mjs <subscriptions.csv> <members.csv> <customers.csv> <output.csv>");
  process.exit(1);
}

const [subscriptions, members, customers] = await Promise.all([load(subscriptionsPath), load(membersPath), load(customersPath)]);
const bestSubscription = new Map();
for (const row of subscriptions) {
  const email = emailKey(row["お客さまメールアドレス"]);
  if (!email || subscriptionPriority(row) <= subscriptionPriority(bestSubscription.get(email) ?? {})) continue;
  bestSubscription.set(email, row);
}
const customerByEmail = new Map(customers.map((row) => [emailKey(row["メールアドレス"]), row]));
const memberByEmail = new Map();
for (const row of members) {
  const email = emailKey(row["メールアドレス"]);
  if (email && !memberByEmail.has(email)) memberByEmail.set(email, row);
}

const headers = ["discord_user_id", "discord_name", "billing_email", "display_name", "discord_roles", "achievement_badges", "discord_joined_at", "member_term", "member_rank", "square_customer_id", "square_subscription_id", "subscription_status", "billing_status", "overdue_since", "grace_until_date", "paid_until_date"];
const outputRows = [];
for (const [email, subscription] of [...bestSubscription].sort(([a], [b]) => a.localeCompare(b))) {
  const member = memberByEmail.get(email) ?? {};
  const customer = customerByEmail.get(email) ?? {};
  const roleIds = splitList(member["全ロールID"]);
  const roleNames = splitList(member["全ロール名"]);
  const roles = roleNames.map((name, index) => `${roleIds[index] || `name:${name}`}:${name}`);
  const badges = roleNames.filter((name) => /大賞|表彰|受賞|award|winner|champion|優勝/i.test(name));
  const nickname = member["ニックネーム"] && member["ニックネーム"] !== "未設定" ? member["ニックネーム"] : member["ユーザー名"];
  const status = squareStatus(subscription["ステータス"]);
  const overdue = subscription["請求ステータス"] === "期限超過";
  const overdueSince = overdue ? isoDate(subscription["最終請求日"]) : "";
  const graceUntil = overdueSince ? new Date(`${overdueSince}T00:00:00Z`) : null;
  if (graceUntil) graceUntil.setUTCDate(graceUntil.getUTCDate() + 7);
  const paidUntil = subscription["ステータス"] === "キャンセルを保留中"
    ? isoDate(subscription["キャンセル日"] || subscription["次の請求日"])
    : isoDate(subscription["次の請求日"] || subscription["最終請求日"]);
  outputRows.push({
    discord_user_id: member["ユーザーID"] ?? "", discord_name: member["ユーザー名"] ?? "", billing_email: email,
    display_name: nickname || member["ユーザー名"] || "", discord_roles: roles.join("|"), achievement_badges: badges.join("|"),
    discord_joined_at: isoDate(member["サーバー参加日"]), member_term: memberTerm(subscription["プラン名"]), member_rank: memberRank(roleNames),
    square_customer_id: customer["Square の顧客 ID"] ?? "", square_subscription_id: subscription["サブスクリプションID"] ?? "",
    subscription_status: status, billing_status: subscription["請求ステータス"] ?? "", overdue_since: overdueSince,
    grace_until_date: graceUntil ? graceUntil.toISOString().slice(0, 10) : "", paid_until_date: paidUntil,
  });
}

await writeFile(outputPath, `${headers.join(",")}\n${outputRows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n")}\n`, { mode: 0o600 });
const summary = {
  output: basename(outputPath), total: outputRows.length,
  active: outputRows.filter((row) => row.subscription_status === "ACTIVE").length,
  paused: outputRows.filter((row) => row.subscription_status === "PAUSED").length,
  canceled: outputRows.filter((row) => row.subscription_status === "CANCELED").length,
  overdue: outputRows.filter((row) => row.billing_status === "期限超過").length,
  discordMatched: outputRows.filter((row) => row.discord_user_id).length,
  customerIdMatched: outputRows.filter((row) => row.square_customer_id).length,
  achievementBadgeMembers: outputRows.filter((row) => row.achievement_badges).length,
};
console.log(JSON.stringify(summary, null, 2));
