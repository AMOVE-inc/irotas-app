import type { MemberImportCandidate } from "../lib/member-import-dry-run";
import {
  authenticatedRequestMember,
  emailDeliveryConfigured,
  normalizeEmail,
} from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const COMMIT_ENDPOINT = "/api/admin/member-import/commit";
const READINESS_ENDPOINT = "/api/admin/member-import/readiness";
const MAX_BATCH_SIZE = 25;
const MAX_REQUEST_BYTES = 256 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidatedMemberImport = {
  email: string;
  displayName: string;
  memberId: string;
  discordUserId: string | null;
  squareCustomerId: string | null;
  squareSubscriptionId: string | null;
  squarePlanId: string | null;
  squareStatus: "ACTIVE" | "PAUSED" | "CANCELED" | "UNKNOWN";
  billingStatus: string | null;
  accessStatus: "active" | "grace" | "suspended";
  paidUntilDate: string | null;
  graceUntilDate: string | null;
  subscriptionStartedAt: string | null;
  branchesJson: string;
  memberTerm: string | null;
  memberRank: "regular" | "silver" | "gold" | "platinum";
  discordRolesJson: string;
  achievementBadgesJson: string;
  discordJoinedAt: string | null;
};

type ImportBody = {
  confirmation?: unknown;
  sourceFilename?: unknown;
  rows?: unknown;
  reviewApproved?: unknown;
};

export function memberImportConfiguration(env: SitesEnv) {
  const authentication = Boolean(
    env.AUTH_SECRET && emailDeliveryConfigured(env),
  );
  const square = Boolean(
    env.SQUARE_ACCESS_TOKEN &&
    env.SQUARE_WEBHOOK_SIGNATURE_KEY &&
    env.SQUARE_WEBHOOK_NOTIFICATION_URL &&
    env.SQUARE_ALLOWED_PLAN_VARIATION_IDS,
  );
  return { authentication, square, ready: authentication && square };
}

function responseJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function requiredText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function optionalText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function dateOnly(value: unknown) {
  const text = optionalText(value, 10);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function squareStatus(value: unknown): ValidatedMemberImport["squareStatus"] {
  if (value === "有効" || value === "キャンセルを保留中") return "ACTIVE";
  if (value === "一時停止中") return "PAUSED";
  if (value === "キャンセル済み" || value === "解約済み") return "CANCELED";
  return "UNKNOWN";
}

function accessStatus(value: unknown): ValidatedMemberImport["accessStatus"] {
  if (value === "active" || value === "grace") return value;
  return "suspended";
}

function branches(value: unknown) {
  const roles = typeof value === "string" ? value : "";
  const result = [
    ...(roles.includes("関東") ? ["kanto"] : []),
    ...(roles.includes("関西") ? ["kansai"] : []),
  ];
  return JSON.stringify(result);
}

function pipeSeparatedJson(value: unknown) {
  if (typeof value !== "string") return "[]";
  return JSON.stringify(
    value
      .split(/[|,;]/)
      .map((item) => item.normalize("NFKC").trim())
      .filter(Boolean),
  );
}

function memberRank(value: unknown): ValidatedMemberImport["memberRank"] {
  const normalized = String(value ?? "").toLowerCase();
  if (["silver", "gold", "platinum"].includes(normalized))
    return normalized as ValidatedMemberImport["memberRank"];
  return "regular";
}

export function validateMemberImportRequest(body: ImportBody): {
  rows: ValidatedMemberImport[];
  sourceFilename: string | null;
} {
  if (!Array.isArray(body.rows) || body.rows.length < 1)
    throw new Error("rows_required");
  if (body.rows.length > MAX_BATCH_SIZE) throw new Error("too_many_rows");
  const reviewApproved = body.reviewApproved === true;
  const expectedConfirmation = reviewApproved
    ? `IMPORT_REVIEW_${body.rows.length}`
    : `IMPORT_${body.rows.length}`;
  if (body.confirmation !== expectedConfirmation)
    throw new Error("confirmation_required");

  const seenEmails = new Set<string>();
  const seenMemberIds = new Set<string>();
  const seenDiscordIds = new Set<string>();
  const seenSquareCustomerIds = new Set<string>();
  const seenSquareSubscriptionIds = new Set<string>();

  const rows = body.rows.map((value, index) => {
    if (!value || typeof value !== "object")
      throw new Error(`invalid_row:${index}`);
    const row = value as Partial<MemberImportCandidate>;
    if (
      (!reviewApproved && row.migration_action !== "import") ||
      (reviewApproved && row.migration_action !== "review")
    )
      throw new Error(`unsafe_action:${index}`);
    const email = normalizeEmail(String(row.billing_email ?? ""));
    const displayName = requiredText(row.display_name, 80);
    const memberId = requiredText(row.member_id, 32);
    const discordUserId = optionalText(row.discord_user_id, 20);
    const squareCustomerId = optionalText(row.square_customer_id, 64);
    const squareSubscriptionId = optionalText(row.square_subscription_id, 64);
    if (!EMAIL_PATTERN.test(email) || email.length > 254)
      throw new Error(`invalid_email:${index}`);
    if (!displayName) throw new Error(`invalid_display_name:${index}`);
    if (!memberId || !/^IRO\d{4,}$/.test(memberId))
      throw new Error(`invalid_member_id:${index}`);
    if (discordUserId && !/^\d{17,20}$/.test(discordUserId))
      throw new Error(`invalid_discord_id:${index}`);

    const uniqueValues: Array<[Set<string>, string | null, string]> = [
      [seenEmails, email, "email"],
      [seenMemberIds, memberId, "member_id"],
      [seenDiscordIds, discordUserId, "discord_id"],
      [seenSquareCustomerIds, squareCustomerId, "square_customer_id"],
      [
        seenSquareSubscriptionIds,
        squareSubscriptionId,
        "square_subscription_id",
      ],
    ];
    for (const [seen, item, label] of uniqueValues) {
      if (!item) continue;
      if (seen.has(item)) throw new Error(`duplicate_${label}:${index}`);
      seen.add(item);
    }

    return {
      email,
      displayName,
      memberId,
      discordUserId,
      squareCustomerId,
      squareSubscriptionId,
      squarePlanId: optionalText(row.square_plan_id, 64),
      squareStatus: squareStatus(row.subscription_status),
      billingStatus: optionalText(row.billing_status, 64),
      accessStatus: accessStatus(row.access_status),
      paidUntilDate: dateOnly(row.paid_until_date),
      graceUntilDate: dateOnly(row.grace_until_date),
      subscriptionStartedAt: dateOnly(row.subscription_created_at),
      branchesJson: branches(row.discord_roles),
      memberTerm: optionalText(row.member_term, 32),
      memberRank: memberRank(row.member_rank),
      discordRolesJson: pipeSeparatedJson(row.discord_roles),
      achievementBadgesJson: pipeSeparatedJson(row.achievement_badges),
      discordJoinedAt: dateOnly(row.discord_joined_at),
    };
  });

  return {
    rows,
    sourceFilename: optionalText(body.sourceFilename, 120),
  };
}

function memberStatement(
  db: D1Database,
  row: ValidatedMemberImport,
  now: string,
) {
  return db
    .prepare(
      `INSERT INTO members
      (email, display_name, discord_user_id, public_member_id, role, access_role, branches_json,
       member_term, member_rank, discord_roles_json, achievement_badges_json, discord_joined_at,
       account_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'user', 'member', ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        display_name = excluded.display_name,
        discord_user_id = excluded.discord_user_id,
        public_member_id = excluded.public_member_id,
        branches_json = excluded.branches_json,
        member_term = excluded.member_term,
        member_rank = excluded.member_rank,
        discord_roles_json = excluded.discord_roles_json,
        achievement_badges_json = excluded.achievement_badges_json,
        discord_joined_at = excluded.discord_joined_at,
        account_status = 'active',
        updated_at = excluded.updated_at`,
    )
    .bind(
      row.email,
      row.displayName,
      row.discordUserId,
      row.memberId,
      row.branchesJson,
      row.memberTerm,
      row.memberRank,
      row.discordRolesJson,
      row.achievementBadgesJson,
      row.discordJoinedAt,
      now,
      now,
    );
}

async function importMembers(
  db: D1Database,
  rows: ValidatedMemberImport[],
  actorId: number,
  sourceFilename: string | null,
) {
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const existingEmails = new Set<string>();
  const placeholders = rows.map(() => "?").join(", ");
  if (placeholders) {
    const existing = await db
      .prepare(`SELECT email FROM members WHERE email IN (${placeholders})`)
      .bind(...rows.map((row) => row.email))
      .all<{ email: string }>();
    for (const member of existing.results ?? []) {
      existingEmails.add(normalizeEmail(member.email));
    }
  }
  const createdCount = rows.filter((row) => !existingEmails.has(row.email)).length;
  const updatedCount = rows.length - createdCount;
  await db
    .prepare(
      `INSERT INTO migration_runs
      (id, migration_type, source_filename, status, summary_json, started_at)
      VALUES (?, 'member_import', ?, 'started', ?, ?)`,
    )
    .bind(
      runId,
      sourceFilename,
      JSON.stringify({ requestedCount: rows.length }),
      now,
    )
    .run();

  try {
    await db.batch(rows.map((row) => memberStatement(db, row, now)));
    for (const row of rows) {
      const member = await db
        .prepare("SELECT id FROM members WHERE email = ?")
        .bind(row.email)
        .first<{ id: number }>();
      if (!member) throw new Error("member_upsert_failed");
      await db
        .prepare(
          `INSERT INTO member_subscriptions
          (member_id, billing_email, square_customer_id, square_subscription_id, plan_variation_id,
           square_status, billing_status, access_status, paid_until_date, grace_until_date,
           subscription_started_at, last_verified_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(billing_email) DO UPDATE SET
            member_id = excluded.member_id,
            square_customer_id = excluded.square_customer_id,
            square_subscription_id = excluded.square_subscription_id,
            plan_variation_id = excluded.plan_variation_id,
            square_status = excluded.square_status,
            billing_status = excluded.billing_status,
            access_status = excluded.access_status,
            paid_until_date = excluded.paid_until_date,
            grace_until_date = excluded.grace_until_date,
            subscription_started_at = excluded.subscription_started_at,
            last_verified_at = excluded.last_verified_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          member.id,
          row.email,
          row.squareCustomerId,
          row.squareSubscriptionId,
          row.squarePlanId,
          row.squareStatus,
          row.billingStatus,
          row.accessStatus,
          row.paidUntilDate,
          row.graceUntilDate,
          row.subscriptionStartedAt,
          now,
          now,
          now,
        )
        .run();
    }
    await db.batch([
      db
        .prepare(
          `UPDATE migration_runs
           SET status = 'completed', imported_count = ?, summary_json = ?, completed_at = ?
           WHERE id = ?`,
        )
        .bind(
          rows.length,
          JSON.stringify({ importedCount: rows.length, createdCount, updatedCount }),
          now,
          runId,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
           VALUES (?, 'members.import', 'migration_run', ?, ?, ?)`,
        )
        .bind(
          String(actorId),
          runId,
          JSON.stringify({ importedCount: rows.length, createdCount, updatedCount }),
          now,
        ),
    ]);
    return { runId, createdCount, updatedCount };
  } catch (error) {
    await db
      .prepare(
        `UPDATE migration_runs
         SET status = 'failed', error_count = 1, summary_json = ?, completed_at = ?
         WHERE id = ?`,
      )
      .bind(JSON.stringify({ error: "member_import_failed" }), now, runId)
      .run();
    throw error;
  }
}

export async function handleMemberImportRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (![COMMIT_ENDPOINT, READINESS_ENDPOINT].includes(pathname)) return null;
  if (
    (pathname === READINESS_ENDPOINT && request.method !== "GET") ||
    (pathname === COMMIT_ENDPOINT && request.method !== "POST")
  )
    return responseJson({ error: "method_not_allowed" }, 405);
  if (!env.DB)
    return responseJson({ error: "データベースに接続できません" }, 503);

  const member = await authenticatedRequestMember(request, env);
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  if (member.role !== "admin" && member.access_role !== "admin")
    return responseJson({ error: "管理者権限が必要です" }, 403);

  const configuration = memberImportConfiguration(env);
  if (pathname === READINESS_ENDPOINT) return responseJson({ configuration });
  if (!configuration.ready)
    return responseJson(
      { error: "メール認証とSquare連携の設定が完了していません" },
      503,
    );

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json"))
    return responseJson({ error: "JSON形式で送信してください" }, 415);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES)
    return responseJson({ error: "リクエストが大きすぎます" }, 413);

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES)
      return responseJson({ error: "リクエストが大きすぎます" }, 413);
    const validated = validateMemberImportRequest(
      JSON.parse(rawBody) as ImportBody,
    );
    const result = await importMembers(
      env.DB,
      validated.rows,
      member.id,
      validated.sourceFilename,
    );
    return responseJson({
      success: true,
      runId: result.runId,
      importedCount: validated.rows.length,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return responseJson({ error: "JSON形式が正しくありません" }, 400);
    const message =
      error instanceof Error ? error.message.split(":")[0] : "invalid_request";
    const clientErrors = new Set([
      "rows_required",
      "too_many_rows",
      "confirmation_required",
      "invalid_row",
      "unsafe_action",
      "invalid_email",
      "invalid_display_name",
      "invalid_member_id",
      "invalid_discord_id",
      "duplicate_email",
      "duplicate_member_id",
      "duplicate_discord_id",
      "duplicate_square_customer_id",
      "duplicate_square_subscription_id",
    ]);
    return clientErrors.has(message)
      ? responseJson({ error: message }, 400)
      : responseJson({ error: "登録処理に失敗しました" }, 500);
  }
}
