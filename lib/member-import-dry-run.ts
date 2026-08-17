import { isAchievementRole, normalizedRank } from "./role-migration";

export type CsvRow = Record<string, string>;

export type MemberImportIssueCode =
  | "duplicate_subscription_email"
  | "duplicate_discord_email"
  | "missing_discord_member"
  | "missing_square_customer"
  | "discord_withdrawn_but_subscription_active"
  | "test_plan";

export type MemberImportIssue = {
  code: MemberImportIssueCode;
  severity: "warning" | "review";
  email: string;
  message: string;
};

export type MemberImportCandidate = {
  member_id: string;
  subscription_created_at: string;
  discord_user_id: string;
  discord_name: string;
  billing_email: string;
  display_name: string;
  discord_roles: string;
  achievement_badges: string;
  discord_joined_at: string;
  member_term: string;
  member_rank: string;
  square_customer_id: string;
  square_subscription_id: string;
  square_plan_id: string;
  square_plan_name: string;
  subscription_status: string;
  billing_status: string;
  access_status: "active" | "grace" | "paused" | "inactive";
  grace_until_date: string;
  paid_until_date: string;
  migration_action: "import" | "review" | "exclude";
  migration_notes: string;
};

export type MemberImportDryRun = {
  summary: {
    subscriptionRows: number;
    discordRows: number;
    customerRows: number;
    uniqueSubscriptionEmails: number;
    importableMembers: number;
    reviewMembers: number;
    excludedMembers: number;
    activeAccess: number;
    graceAccess: number;
    pausedAccess: number;
  };
  candidates: MemberImportCandidate[];
  issues: MemberImportIssue[];
};

const normalizeEmail = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const normalizeValue = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

function detectDelimiter(header: string): "," | "\t" {
  let commas = 0;
  let tabs = 0;
  let quoted = false;
  for (const char of header) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") commas += 1;
    else if (!quoted && char === "\t") tabs += 1;
    else if (!quoted && (char === "\n" || char === "\r")) break;
  }
  return tabs > commas ? "\t" : ",";
}

export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseSourceCsv(csv: string): CsvRow[] {
  const delimiter = detectDelimiter(csv);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"' && quoted && csv[index + 1] === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, normalizeValue(values[index])])),
  );
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const normalized = value
    .replace(/年|\//g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/, "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnly(value: string): string {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function plusDays(value: string, days: number): string {
  const date = parseDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function subscriptionPriority(row: CsvRow): number {
  const status = row["ステータス"];
  if (status === "有効") return 4;
  if (status === "キャンセルを保留中") return 3;
  if (status === "一時停止中") return 2;
  return 1;
}

function chooseSubscription(rows: CsvRow[]): CsvRow {
  return [...rows].sort((left, right) => {
    const statusDifference = subscriptionPriority(right) - subscriptionPriority(left);
    if (statusDifference) return statusDifference;
    return (parseDate(right["作成日"])?.getTime() ?? 0) - (parseDate(left["作成日"])?.getTime() ?? 0);
  })[0];
}

function deriveTerm(planName: string): string {
  const match = planName.match(/第\s*(\d+)\s*期/);
  return match ? `第${match[1]}期` : "";
}

function splitRoles(value: string): string[] {
  return value
    .split(/[|,;]/)
    .map((role) => role.trim())
    .filter(Boolean);
}

function deriveAccess(subscriptionStatus: string, billingStatus: string): MemberImportCandidate["access_status"] {
  if (subscriptionStatus === "一時停止中") return "paused";
  if (subscriptionStatus !== "有効" && subscriptionStatus !== "キャンセルを保留中") return "inactive";
  if (billingStatus === "期限超過") return "grace";
  return billingStatus === "支払済み" ? "active" : "inactive";
}

export function buildMemberImportDryRun(
  subscriptionCsv: string,
  discordCsv: string,
  customerCsv: string,
): MemberImportDryRun {
  const subscriptions = parseSourceCsv(subscriptionCsv);
  const discordMembers = parseSourceCsv(discordCsv);
  const customers = parseSourceCsv(customerCsv);

  const subscriptionsByEmail = new Map<string, CsvRow[]>();
  for (const row of subscriptions) {
    const email = normalizeEmail(row["お客さまメールアドレス"]);
    if (!email) continue;
    subscriptionsByEmail.set(email, [...(subscriptionsByEmail.get(email) ?? []), row]);
  }
  const discordByEmail = new Map<string, CsvRow[]>();
  for (const row of discordMembers) {
    const email = normalizeEmail(row["メールアドレス"]);
    if (!email) continue;
    discordByEmail.set(email, [...(discordByEmail.get(email) ?? []), row]);
  }
  const customerByEmail = new Map(
    customers
      .map((row) => [normalizeEmail(row["メールアドレス"]), row] as const)
      .filter(([email]) => Boolean(email)),
  );

  const issues: MemberImportIssue[] = [];
  const selected = [...subscriptionsByEmail.entries()].map(([email, rows]) => {
    if (rows.length > 1) {
      issues.push({
        code: "duplicate_subscription_email",
        severity: "warning",
        email,
        message: `サブスク履歴が${rows.length}件あります。現在有効な契約を優先して集約します。`,
      });
    }
    return { email, subscription: chooseSubscription(rows) };
  });

  const memberIdOrder = [...selected]
    .filter(({ subscription }) => subscriptionPriority(subscription) >= 2)
    .sort((left, right) => {
      const dateDifference = (parseDate(left.subscription["作成日"])?.getTime() ?? 0) - (parseDate(right.subscription["作成日"])?.getTime() ?? 0);
      return dateDifference || left.email.localeCompare(right.email);
    });
  const memberIds = new Map(memberIdOrder.map((item, index) => [item.email, `IRO${String(index + 1).padStart(4, "0")}`]));

  const candidates = selected.map(({ email, subscription }): MemberImportCandidate => {
    const discordRows = discordByEmail.get(email) ?? [];
    const discord = discordRows.find((row) => row["状態"] === "有効") ?? discordRows[0];
    const customer = customerByEmail.get(email);
    const issueMessages: string[] = [];
    if (discordRows.length > 1) {
      const message = `Discord会員情報が${discordRows.length}件あります。`;
      issues.push({ code: "duplicate_discord_email", severity: "review", email, message });
      issueMessages.push(message);
    }
    if (!discord) {
      const message = "Discord会員情報がありません。";
      issues.push({ code: "missing_discord_member", severity: "review", email, message });
      issueMessages.push(message);
    }
    if (!customer) {
      const message = "Square顧客IDがありません。";
      issues.push({ code: "missing_square_customer", severity: "review", email, message });
      issueMessages.push(message);
    }
    const accessStatus = deriveAccess(subscription["ステータス"], subscription["請求ステータス"]);
    if (discord && discord["状態"] !== "有効" && (accessStatus === "active" || accessStatus === "grace")) {
      const message = "Squareは有効ですがDiscordは退会状態です。";
      issues.push({ code: "discord_withdrawn_but_subscription_active", severity: "review", email, message });
      issueMessages.push(message);
    }
    if (/test/i.test(subscription["プラン名"])) {
      const message = "テスト用プランです。";
      issues.push({ code: "test_plan", severity: "review", email, message });
      issueMessages.push(message);
    }

    const roles = splitRoles(discord?.["全ロール名"] ?? "");
    const rank = roles.map(normalizedRank).find(Boolean) ?? "regular";
    const isCurrentSubscription = subscriptionPriority(subscription) >= 2;
    const migrationAction = !isCurrentSubscription
      ? "exclude"
      : issueMessages.length
        ? "review"
        : "import";
    const paidUntil = toDateOnly(subscription["次の請求日"] || subscription["キャンセル日"] || subscription["最終請求日"]);
    return {
      member_id: memberIds.get(email) ?? "",
      subscription_created_at: toDateOnly(subscription["作成日"]),
      discord_user_id: discord?.["ユーザーID"] ?? "",
      discord_name: discord?.["ユーザー名"] ?? "",
      billing_email: email,
      display_name: discord?.["ニックネーム"] || discord?.["ユーザー名"] || subscription["顧客名"],
      discord_roles: roles.join("|"),
      achievement_badges: roles.filter(isAchievementRole).join("|"),
      discord_joined_at: toDateOnly(discord?.["サーバー参加日"] ?? ""),
      member_term: deriveTerm(subscription["プラン名"]),
      member_rank: rank,
      square_customer_id: customer?.["Square の顧客 ID"] ?? "",
      square_subscription_id: subscription["サブスクリプションID"],
      square_plan_id: subscription["プランID"],
      square_plan_name: subscription["プラン名"],
      subscription_status: subscription["ステータス"],
      billing_status: subscription["請求ステータス"],
      access_status: accessStatus,
      grace_until_date: accessStatus === "grace" ? plusDays(subscription["最終請求日"], 7) : "",
      paid_until_date: paidUntil,
      migration_action: migrationAction,
      migration_notes: issueMessages.join(" "),
    };
  });

  return {
    summary: {
      subscriptionRows: subscriptions.length,
      discordRows: discordMembers.length,
      customerRows: customers.length,
      uniqueSubscriptionEmails: subscriptionsByEmail.size,
      importableMembers: candidates.filter((candidate) => candidate.migration_action === "import").length,
      reviewMembers: candidates.filter((candidate) => candidate.migration_action === "review").length,
      excludedMembers: candidates.filter((candidate) => candidate.migration_action === "exclude").length,
      activeAccess: candidates.filter((candidate) => candidate.access_status === "active").length,
      graceAccess: candidates.filter((candidate) => candidate.access_status === "grace").length,
      pausedAccess: candidates.filter((candidate) => candidate.access_status === "paused").length,
    },
    candidates,
    issues,
  };
}

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportMemberImportCsv(candidates: MemberImportCandidate[]): string {
  const headers = Object.keys(candidates[0] ?? {}) as Array<keyof MemberImportCandidate>;
  if (!headers.length) return "";
  return [
    headers.join(","),
    ...candidates.map((candidate) => headers.map((header) => escapeCsv(String(candidate[header] ?? ""))).join(",")),
  ].join("\r\n");
}
