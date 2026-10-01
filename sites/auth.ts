import { discoverSquareMembership } from "./square-membership-discovery";
import type { D1Database, SitesEnv } from "./platform-types";
import { syncStoredDiscordProfiles } from "./discord-profile-sync";
import {
  admissionAccessError,
  findAdmissionReviewStatus,
} from "./admission-status";

const encoder = new TextEncoder();
const SESSION_COOKIE = "__Host-irotas_session";
const SESSION_DAYS = 30;
// Cloudflare Workers currently caps a single PBKDF2 operation at 100,000
// iterations. Production hashes also use AUTH_SECRET as an HMAC pepper so a
// database-only leak is not sufficient to test password guesses offline.
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_SCHEME = "pbkdf2_sha256_hmac";

type MemberRow = {
  id: number;
  email: string;
  password_hash: string | null;
  display_name: string;
  role: "user" | "operator" | "admin";
  access_role: "member" | "club_leader" | "operator" | "admin";
  branches_json: string;
  account_status: "active" | "suspended" | "withdrawn";
  last_signed_in_at: string | null;
  password_set_at?: string | null;
  public_member_id: string | null;
  user_handle: string | null;
  member_term: string | null;
  member_rank: string | null;
  discord_roles_json: string | null;
  achievement_badges_json: string | null;
  profile_json: string | null;
  xp: number | null;
  participation_count: number | null;
  organizer_count: number | null;
  subscription_started_at?: string | null;
};

type SubscriptionRow = {
  member_id?: number | null;
  billing_email: string;
  square_subscription_id?: string | null;
  square_status: string;
  billing_status?: string | null;
  access_status: "pending" | "active" | "grace" | "suspended";
  paid_until_date: string | null;
  grace_until_date: string | null;
};

type SessionMemberRow = MemberRow & SubscriptionRow;

export type AuthenticatedRequestMember = Pick<
  MemberRow,
  "id" | "role" | "access_role" | "account_status"
>;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeBranchSelection(value: unknown) {
  if (!Array.isArray(value)) return null;
  const branches = value.filter(
    (branch): branch is "kanto" | "kansai" =>
      branch === "kanto" || branch === "kansai",
  );
  if (
    branches.length !== value.length ||
    branches.length < 1 ||
    branches.length > 2 ||
    new Set(branches).size !== branches.length
  )
    return null;
  return branches;
}

export function isBootstrapAdminEmail(env: SitesEnv, email: string) {
  const configured = normalizeEmail(env.BOOTSTRAP_ADMIN_EMAIL ?? "");
  return Boolean(configured && configured === normalizeEmail(email));
}

export async function sha256(value: string) {
  return toBase64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function isTrustedBrowserOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  );
}

export async function hashPassword(
  password: string,
  salt = crypto.getRandomValues(new Uint8Array(16)),
  pepper = "",
) {
  const passwordMaterial = pepper
    ? await hmacSha256(pepper, password)
    : password;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passwordMaterial),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  const scheme = pepper ? PASSWORD_SCHEME : "pbkdf2_sha256";
  return `${scheme}$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
  pepper = "",
) {
  const [scheme, iterationsText, saltText, expected] = encoded.split("$");
  if (
    !["pbkdf2_sha256", PASSWORD_SCHEME].includes(scheme) ||
    !iterationsText ||
    !saltText ||
    !expected
  )
    return false;
  const iterations = Number(iterationsText);
  if (
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000
  )
    return false;
  const salt = fromBase64Url(saltText);
  if (scheme === PASSWORD_SCHEME && !pepper) return false;
  const passwordMaterial =
    scheme === PASSWORD_SCHEME ? await hmacSha256(pepper, password) : password;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passwordMaterial),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  const actual = toBase64Url(new Uint8Array(bits));
  return constantTimeEqual(actual, expected);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function accountDeletionDeadline(now = new Date()) {
  return addDays(now, 30);
}

function endOfDate(value: string) {
  const key = value.slice(0, 10);
  return new Date(`${key}T23:59:59+09:00`).getTime();
}

export function membershipAllowsAccess(
  subscription: SubscriptionRow | null,
  member: Pick<
    MemberRow,
    "role" | "access_role" | "account_status"
  > &
    Partial<Pick<MemberRow, "discord_roles_json">>,
  now = new Date(),
) {
  if (member.account_status !== "active") return false;
  if (
    member.role === "admin" ||
    member.role === "operator" ||
    ["admin", "operator", "club_leader"].includes(member.access_role) ||
    hasDiscordStaffRole(member.discord_roles_json)
  )
    return true;
  if (subscription?.billing_status === "OVERDUE_BLOCKED") return false;
  if (
    !subscription ||
    subscription.access_status === "pending" ||
    subscription.access_status === "suspended"
  )
    return false;
  if (subscription.access_status === "grace")
    return Boolean(
      subscription.grace_until_date &&
      now.getTime() <= endOfDate(subscription.grace_until_date),
    );
  return subscription.square_status === "ACTIVE";
}

/**
 * Discordの運営ロールは、Squareのサブスクリプションとは独立して
 * アプリへのアクセスを許可する。ロール照合テーブルの反映前でも
 * 初回ログインで弾かれないよう、インポート済みのロール名を補助的に使う。
 */
export function hasDiscordStaffRole(value: string | null | undefined) {
  if (!value) return false;
  try {
    const roles = JSON.parse(value);
    if (!Array.isArray(roles)) return false;
    return roles.some((role) => {
      if (typeof role !== "string") return false;
      const normalized = role
        .normalize("NFKC")
        .replace(/[\s　]/g, "")
        .toLowerCase();
      return [
        "運営",
        "運営メンバー",
        "iro+運営",
        "iro+運営メンバー",
        "管理者",
      ].includes(normalized);
    });
  } catch {
    return false;
  }
}

export function extractSessionToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer "))
    return authorization.slice(7).trim();
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === SESSION_COOKIE) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function jsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function cleanMemberDisplayName(value: string) {
  return value
    .replace(/\s*[【\[]\s*(?:💎\s*)?PLATINUM\s*[】\]]\s*$/iu, "")
    .replace(/\s*[【\[]\s*(?:🥇\s*)?GOLD\s*[】\]]\s*$/iu, "")
    .replace(/\s*[【\[]\s*(?:🥈\s*)?SILVER\s*[】\]]\s*$/iu, "")
    .replace(/\s*[【\[]\s*REGULAR\s*[】\]]\s*$/iu, "")
    .trim();
}

export function effectiveMemberRank(
  storedRank: string | null | undefined,
  rolesJson: string | null | undefined,
) {
  const roles = jsonArray(rolesJson).join(" ").toLowerCase();
  if (roles.includes("platinum") || roles.includes("プラチナ"))
    return "platinum";
  if (roles.includes("gold") || roles.includes("ゴールド")) return "gold";
  if (roles.includes("silver") || roles.includes("シルバー")) return "silver";
  return ["regular", "silver", "gold", "platinum"].includes(storedRank ?? "")
    ? storedRank
    : "regular";
}

function profilePayload(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function memberPayload(row: MemberRow) {
  let branches: string[] = [];
  try {
    branches = JSON.parse(row.branches_json);
  } catch {}
  return {
    id: row.id,
    openId: `member:${row.id}`,
    name: cleanMemberDisplayName(row.display_name),
    email: row.email,
    loginMethod: "email",
    lastSignedIn: row.last_signed_in_at ?? new Date().toISOString(),
    firstSignedIn: row.password_set_at ?? row.last_signed_in_at ?? new Date().toISOString(),
    role: row.role === "operator" ? "operator" : row.role,
    accessRole: row.access_role,
    branch: branches[0] ?? null,
    branches,
    memberId: row.public_member_id,
    publicUserId: row.user_handle,
    memberTerm: row.member_term,
    memberRank: effectiveMemberRank(row.member_rank, row.discord_roles_json),
    joinedAt: row.subscription_started_at ?? null,
    achievementBadges: jsonArray(row.achievement_badges_json),
    profile: profilePayload(row.profile_json),
    xp:
      ["operator", "admin"].includes(row.access_role) ||
      ["operator", "admin"].includes(row.role)
        ? 0
        : (row.xp ?? 0),
    participationCount: row.participation_count ?? 0,
    organizerCount: row.organizer_count ?? 0,
  };
}

function responseJson(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function sessionCookie(token: string, expires: Date) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function readJson(request: Request) {
  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("unsupported_media_type");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32_768) throw new Error("request_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32_768)
    throw new Error("request_too_large");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json");
  }
}

async function rateLimit(
  db: D1Database,
  rawKey: string,
  limit: number,
  windowMinutes: number,
) {
  const rateKey = await sha256(rawKey);
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
  const current = await db
    .prepare(
      "SELECT window_started_at, attempt_count FROM auth_rate_limits WHERE rate_key = ?",
    )
    .bind(rateKey)
    .first<{ window_started_at: string; attempt_count: number }>();
  if (!current || current.window_started_at < cutoff) {
    await db
      .prepare(
        "INSERT INTO auth_rate_limits (rate_key, window_started_at, attempt_count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(rate_key) DO UPDATE SET window_started_at = excluded.window_started_at, attempt_count = 1, updated_at = excluded.updated_at",
      )
      .bind(rateKey, now.toISOString(), now.toISOString())
      .run();
    return true;
  }
  if (current.attempt_count >= limit) return false;
  await db
    .prepare(
      "UPDATE auth_rate_limits SET attempt_count = attempt_count + 1, updated_at = ? WHERE rate_key = ?",
    )
    .bind(now.toISOString(), rateKey)
    .run();
  return true;
}

async function findSubscription(db: D1Database, email: string) {
  return db
    .prepare(
      "SELECT member_id, billing_email, square_status, billing_status, access_status, paid_until_date, grace_until_date FROM member_subscriptions WHERE LOWER(TRIM(billing_email)) = ?",
    )
    .bind(email)
    .first<SubscriptionRow>();
}

const memberSelect = `SELECT m.id, m.email, m.password_hash, m.display_name, m.role, m.access_role,
      m.branches_json, m.account_status, m.last_signed_in_at, m.password_set_at, m.public_member_id, m.user_handle,
      m.member_term, m.member_rank, m.discord_roles_json, m.achievement_badges_json,
      m.profile_json, m.xp, m.participation_count, m.organizer_count,
      s.subscription_started_at
      FROM members m
      LEFT JOIN member_subscriptions s ON s.member_id = m.id OR LOWER(TRIM(s.billing_email)) = LOWER(TRIM(m.email))`;

async function findMember(db: D1Database, email: string) {
  return db
    .prepare(
      `${memberSelect} WHERE LOWER(TRIM(m.email)) = ? ORDER BY s.id DESC LIMIT 1`,
    )
    .bind(email)
    .first<MemberRow>();
}

async function findSubscriptionMember(db: D1Database, subscription: SubscriptionRow | null) {
  if (!subscription?.member_id) return null;
  return db.prepare(`${memberSelect} WHERE m.id = ? ORDER BY s.id DESC LIMIT 1`)
    .bind(subscription.member_id).first<MemberRow>();
}

async function applyStoredDiscordIdentityClaim(
  db: D1Database,
  member: MemberRow,
  now: string,
) {
  const claim = await db.prepare(
    `SELECT discord_user_id FROM discord_identity_claims
     WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))`,
  ).bind(member.email).first<{ discord_user_id: string }>();
  if (!claim) return member;
  const owner = await db.prepare(
    "SELECT id FROM members WHERE discord_user_id = ? AND id <> ?",
  ).bind(claim.discord_user_id, member.id).first<{ id: number }>();
  if (owner) return member;

  const linked = await db.prepare(
    `UPDATE members SET discord_user_id = ?, updated_at = ?
     WHERE id = ? AND (discord_user_id IS NULL OR TRIM(discord_user_id) = '' OR discord_user_id = ?)`,
  ).bind(claim.discord_user_id, now, member.id, claim.discord_user_id).run();
  if (Number(linked.meta?.changes ?? 0) !== 1) return member;

  await syncStoredDiscordProfiles(db, now, [claim.discord_user_id], {
    overwriteDisplayName: false,
  }).run();
  await db.batch([
    db.prepare(`INSERT INTO club_memberships
      (club_id, member_id, status, source, applied_at, approved_at, updated_at)
      SELECT c.id, ?, 'approved', 'discord', ?, ?, ?
      FROM discord_profile_snapshots p
      JOIN clubs c
      CROSS JOIN json_each(CASE WHEN json_valid(p.discord_roles_json) THEN p.discord_roles_json ELSE '[]' END) role
      WHERE p.discord_user_id = ? AND CAST(role.value AS TEXT) LIKE '%' || c.name || '%'
      ON CONFLICT(club_id, member_id) DO UPDATE SET
        status = 'approved', source = 'discord',
        approved_at = COALESCE(club_memberships.approved_at, excluded.approved_at),
        updated_at = excluded.updated_at`)
      .bind(member.id, now, now, now, claim.discord_user_id),
    db.prepare("UPDATE discord_identity_claims SET consumed_at = ? WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))")
      .bind(now, member.email),
    db.prepare(`INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (NULL, 'member.discord_identity_claim_consumed', 'member', ?, ?, ?)`)
      .bind(String(member.id), JSON.stringify({ discordUserId: claim.discord_user_id }), now),
  ]);
  return (await findMember(db, member.email)) ?? member;
}

async function createSession(db: D1Database, memberId: number) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expires = addDays(new Date(), SESSION_DAYS);
  await db
    .prepare(
      "INSERT INTO member_sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(tokenHash, memberId, expires.toISOString())
    .run();
  return { token, expires };
}

async function sessionMember(db: D1Database, token: string) {
  const tokenHash = await sha256(token);
  return db
    .prepare(
      `SELECT m.id, m.email, m.password_hash, m.display_name, m.role, m.access_role, m.branches_json, m.account_status, m.last_signed_in_at, m.password_set_at,
    m.public_member_id, m.user_handle, m.member_term, m.member_rank, m.discord_roles_json,
    m.achievement_badges_json, m.profile_json, m.xp, m.participation_count,
    m.organizer_count, s.subscription_started_at,
    s.billing_email, s.square_subscription_id, s.square_status, s.billing_status, s.access_status, s.paid_until_date, s.grace_until_date
    FROM member_sessions ms
    JOIN members m ON m.id = ms.member_id
    LEFT JOIN member_subscriptions s ON s.member_id = m.id OR LOWER(TRIM(s.billing_email)) = LOWER(TRIM(m.email))
    WHERE ms.token_hash = ? AND ms.expires_at > ?
    ORDER BY s.id DESC LIMIT 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionMemberRow>();
}

export async function requestHasMemberAccess(
  request: Request,
  env: SitesEnv,
  allowedAccessRoles?: MemberRow["access_role"][],
) {
  const member = await authenticatedRequestMember(request, env);
  if (!member) return false;
  if (!allowedAccessRoles?.length) return true;
  return (
    allowedAccessRoles.includes(member.access_role) || member.role === "admin"
  );
}

export async function authenticatedRequestMember(
  request: Request,
  env: SitesEnv,
): Promise<AuthenticatedRequestMember | null> {
  if (!env.DB) return null;
  const token = extractSessionToken(request);
  if (!token) return null;
  const member = await sessionMember(env.DB, token);
  if (!member || !membershipAllowsAccess(member, member)) return null;
  return {
    id: member.id,
    role: member.role,
    access_role: member.access_role,
    account_status: member.account_status,
  };
}

async function verificationHash(
  secret: string,
  email: string,
  purpose: string,
  code: string,
) {
  return hmacSha256(secret, `${email}:${purpose}:${code}`);
}

export function emailDeliveryConfigured(env: SitesEnv) {
  return Boolean(
    env.EMAIL_DELIVERY_WEBHOOK_URL ||
    (env.RESEND_API_KEY && env.AUTH_EMAIL_FROM),
  );
}

export async function sendTransactionalEmail(
  env: SitesEnv,
  input: { to: string; subject: string; text: string; idempotencyKey: string },
) {
  if (!emailDeliveryConfigured(env)) throw new Error("email_not_configured");
  const response = env.EMAIL_DELIVERY_WEBHOOK_URL
    ? await fetch(env.EMAIL_DELIVERY_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.EMAIL_DELIVERY_WEBHOOK_TOKEN
            ? { authorization: `Bearer ${env.EMAIL_DELIVERY_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ to: input.to, subject: input.subject, text: input.text }),
      })
    : await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "idempotency-key": await sha256(input.idempotencyKey),
        },
        body: JSON.stringify({
          from: env.AUTH_EMAIL_FROM,
          to: [input.to],
          subject: input.subject,
          text: input.text,
        }),
      });
  if (!response.ok) throw new Error("email_delivery_failed");
}

async function sendCode(env: SitesEnv, email: string, code: string) {
  const subject = "IRO+ 初回認証コード";
  const text = `認証コードは ${code} です。有効期限は10分です。心当たりがない場合は、このメールを破棄してください。`;
  await sendTransactionalEmail(env, { to: email, subject, text, idempotencyKey: `initial-setup:${email}:${code}` });
}

async function requestSetupCode(
  request: Request,
  env: SitesEnv,
  db: D1Database,
) {
  if (!env.AUTH_SECRET)
    return responseJson({ error: "認証設定が完了していません" }, 503);
  const input = await readJson(request);
  const email = normalizeEmail(String(input.email ?? ""));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
    return responseJson(
      { error: "有効なメールアドレスを入力してください" },
      400,
    );
  const emailKey = await hmacSha256(env.AUTH_SECRET, `setup-diagnostic:${email}`);
  const recordOutcome = (outcome: string, details: Record<string, unknown> = {}) => {
    // Never record the recipient, code, credentials, or provider response body.
    console.info(JSON.stringify({ event: "auth.setup_code", emailKey, outcome, ...details }));
  };
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const emailAllowed = await rateLimit(db, `setup-email:${email}`, 5, 60);
  const ipAllowed = emailAllowed && await rateLimit(db, `setup-ip:${ip}`, 20, 60);
  if (!emailAllowed || !ipAllowed) {
    recordOutcome(emailAllowed ? "ip_rate_limited" : "email_rate_limited");
    return responseJson({ error: "認証コードの送信回数が上限に達しました。しばらく時間をおいて再度お試しください。" }, 429);

  }
  // Mailbox verification is independent of membership imports. Authorization
  // remains enforced in register/login; sending a code never grants access.
  const code = String(
    crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000,
  ).padStart(6, "0");
  const codeHash = await verificationHash(
    env.AUTH_SECRET,
    email,
    "initial_setup",
    code,
  );
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  await db
    .prepare(
      "INSERT INTO email_verification_codes (email, code_hash, purpose, expires_at) VALUES (?, ?, 'initial_setup', ?)",
    )
    .bind(email, codeHash, expires)
    .run();
  try {
    await sendCode(env, email, code);
    recordOutcome("provider_accepted");
  } catch (error) {
    recordOutcome("delivery_failed");
    await db
      .prepare(
        "DELETE FROM email_verification_codes WHERE email = ? AND code_hash = ?",
      )
      .bind(email, codeHash)
      .run();
    throw error;
  }
  return responseJson({ success: true });
}

async function register(request: Request, env: SitesEnv, db: D1Database) {
  if (!env.AUTH_SECRET)
    return responseJson({ error: "認証設定が完了していません" }, 503);
  const input = await readJson(request);
  const email = normalizeEmail(String(input.email ?? ""));
  const password = String(input.password ?? "");
  const code = String(input.verificationCode ?? "");
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 8 ||
    password.length > 128 ||
    !/^\d{6}$/.test(code)
  )
    return responseJson({ error: "入力内容をご確認ください" }, 400);
  let member = await findMember(db, email);
  let subscription = await findSubscription(db, email);
  const replacingExistingPassword = Boolean(member?.password_hash);
  if (member && subscription?.member_id && subscription.member_id !== member.id)
    return responseJson({ error: "会員アカウントの紐付けを確認できません" }, 409);
  // A fresh email code authorizes both first-time setup and recovery of an
  // existing password. Verification stays mandatory on this endpoint so it
  // cannot become an unthrottled second login path.
  const verification = await db
    .prepare(
      "SELECT id, code_hash, expires_at, failed_attempts FROM email_verification_codes WHERE email = ? AND purpose = 'initial_setup' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .bind(email)
    .first<{
      id: number;
      code_hash: string;
      expires_at: string;
      failed_attempts: number;
    }>();
  if (
    !verification ||
    verification.expires_at <= new Date().toISOString() ||
    verification.failed_attempts >= 5
  )
    return responseJson(
      { error: "認証コードが正しくないか、有効期限が切れています" },
      400,
    );
  const suppliedHash = await verificationHash(
    env.AUTH_SECRET,
    email,
    "initial_setup",
    code,
  );
  if (!constantTimeEqual(suppliedHash, verification.code_hash)) {
    await db
      .prepare(
        "UPDATE email_verification_codes SET failed_attempts = failed_attempts + 1 WHERE id = ?",
      )
      .bind(verification.id)
      .run();
    return responseJson(
      { error: "認証コードが正しくないか、有効期限が切れています" },
      400,
    );
  }
  if (isBootstrapAdminEmail(env, email)) {
    const needsBootstrap =
      !member ||
      member.role !== "admin" ||
      member.access_role !== "admin" ||
      member.account_status !== "active";
    if (needsBootstrap) {
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO members
          (email, display_name, role, access_role, branches_json, account_status, created_at, updated_at)
          VALUES (?, '', 'admin', 'admin', '[]', 'active', ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            role = 'admin',
            access_role = 'admin',
            account_status = 'active',
            updated_at = excluded.updated_at`,
        )
        .bind(email, now, now)
        .run();
      member = await findMember(db, email);
      await db
        .prepare(
          `INSERT INTO audit_logs
          (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
          VALUES (NULL, 'auth.bootstrap_admin', 'member', ?, ?, ?)`,
        )
        .bind(
          member ? String(member.id) : null,
          JSON.stringify({ source: "BOOTSTRAP_ADMIN_EMAIL" }),
          now,
        )
        .run();
    }
  }
  if (member && member.account_status !== "active")
    return responseJson({ error: "有効な会員資格を確認できません" }, 403);
  let discoveredMemberTerm: string | null = null;
  if (!membershipAllowsAccess(subscription, member ?? { role: "user", access_role: "member", account_status: "active" }) || (member && !member.member_term)) {
    const discovery = await discoverSquareMembership(db, env, email);
    discoveredMemberTerm = discovery.memberTerm;
    subscription = await findSubscription(db, email);
  }
  if (member && subscription?.member_id && subscription.member_id !== member.id)
    return responseJson({ error: "会員アカウントの紐付けを確認できません" }, 409);
  if (!member && subscription?.member_id) {
    const linked = await findSubscriptionMember(db, subscription);
    if (linked?.password_hash) return responseJson({ error: "会員アカウントの紐付けを確認できません" }, 409);
    if (linked) member = linked;
  }
  const candidate = member ?? { role: "user" as const, access_role: "member" as const, account_status: "active" as const };
  if (!membershipAllowsAccess(subscription, candidate)) {
    const failure = admissionAccessError(
      await findAdmissionReviewStatus(db, email),
      subscription,
    );
    return responseJson({ error: failure.message, code: failure.code }, 403);
  }
  if (!member) {
    const createdAt = new Date().toISOString();
    await db.prepare(`INSERT INTO members (email, display_name, role, access_role, branches_json, account_status, created_at, updated_at)
      VALUES (?, ?, 'user', 'member', '[]', 'active', ?, ?) ON CONFLICT(email) DO NOTHING`)
      .bind(email, email.split("@")[0], createdAt, createdAt).run();
    member = await findMember(db, email);
    if (!member || !membershipAllowsAccess(subscription, member))
      return responseJson({ error: "会員情報が更新されました。再度お試しください。" }, 409);
  }
  if (discoveredMemberTerm && !member.member_term) {
    const updatedAt = new Date().toISOString();
    await db.prepare("UPDATE members SET member_term = ?, updated_at = ? WHERE id = ? AND (member_term IS NULL OR TRIM(member_term) = '')")
      .bind(discoveredMemberTerm, updatedAt, member.id).run();
    member.member_term = discoveredMemberTerm;
  }
  member = await applyStoredDiscordIdentityClaim(
    db,
    member,
    new Date().toISOString(),
  );
  const passwordHash = await hashPassword(password, undefined, env.AUTH_SECRET);
  const now = new Date().toISOString();
  if (normalizeEmail(member.email) !== email) {
    const collision = await findMember(db, email);
    if (collision) return responseJson({ error: "会員アカウントの紐付けを確認できません" }, 409);
    const updatedEmail = await db.prepare("UPDATE members SET email = ?, updated_at = ? WHERE id = ? AND password_hash IS NULL")
      .bind(email, now, member.id).run();
    if (Number(updatedEmail.meta?.changes ?? 0) !== 1)
      return responseJson({ error: "会員アカウントの紐付けを確認できません" }, 409);
    member.email = email;
  }
  await db.batch([
    ...(replacingExistingPassword
      ? [db.prepare("DELETE FROM member_sessions WHERE member_id = ?").bind(member.id)]
      : []),
    db
      .prepare(
        "UPDATE members SET password_hash = ?, display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END, password_set_at = ?, last_signed_in_at = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        passwordHash,
        email.split("@")[0],
        now,
        now,
        now,
        member.id,
      ),
    db
      .prepare(
        "UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?",
      )
      .bind(now, verification.id),
    db
      .prepare(
        "UPDATE member_subscriptions SET member_id = ?, updated_at = ? WHERE LOWER(TRIM(billing_email)) = ?",
      )
      .bind(member.id, now, email),
    ...(replacingExistingPassword
      ? [
          db.prepare(
            `INSERT INTO audit_logs
             (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
             VALUES (?, 'auth.password_reset', 'member', ?, '{}', ?)`,
          ).bind(member.id, String(member.id), now),
        ]
      : []),
  ]);
  const updated = {
    ...member,
    password_hash: passwordHash,
    display_name: member.display_name || email.split("@")[0],
    last_signed_in_at: now,
    password_set_at: now,
  };
  const session = await createSession(db, member.id);
  return responseJson(
    {
      success: true,
      sessionToken: session.token,
      user: memberPayload(updated),
    },
    200,
    { "set-cookie": sessionCookie(session.token, session.expires) },
  );
}

async function login(request: Request, env: SitesEnv, db: D1Database) {
  const input = await readJson(request);
  const email = normalizeEmail(String(input.email ?? ""));
  const password = String(input.password ?? "");
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(db, `login:${email}:${ip}`, 10, 15)))
    return responseJson(
      { error: "試行回数が多すぎます。しばらくしてからお試しください" },
      429,
    );
  const member = await findMember(db, email);
  if (
    !member?.password_hash ||
    !(await verifyPassword(password, member.password_hash, env.AUTH_SECRET))
  )
    return responseJson(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      401,
    );
  const subscription = await findSubscription(db, email);
  if (!membershipAllowsAccess(subscription, member)) {
    const failure = admissionAccessError(
      await findAdmissionReviewStatus(db, email),
      subscription,
    );
    return responseJson({ error: failure.message, code: failure.code }, 403);
  }
  const now = new Date().toISOString();
  await db
    .prepare(
      "UPDATE members SET last_signed_in_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(now, now, member.id)
    .run();
  const session = await createSession(db, member.id);
  return responseJson(
    {
      success: true,
      sessionToken: session.token,
      user: memberPayload({ ...member, last_signed_in_at: now }),
    },
    200,
    { "set-cookie": sessionCookie(session.token, session.expires) },
  );
}

async function me(request: Request, db: D1Database) {
  const token = extractSessionToken(request);
  if (!token) return responseJson({ user: null });
  const member = await sessionMember(db, token);
  if (!member || !membershipAllowsAccess(member, member))
    return responseJson({ user: null });
  return responseJson({ user: memberPayload(member) });
}

async function logout(request: Request, db: D1Database) {
  const token = extractSessionToken(request);
  if (token)
    await db
      .prepare("DELETE FROM member_sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  const clearCookie = clearSessionCookie();
  if (new URL(request.url).searchParams.get("redirect") === "login") {
    return new Response(null, {
      status: 303,
      headers: {
        "cache-control": "no-store",
        location: "/login",
        "set-cookie": clearCookie,
      },
    });
  }
  return responseJson({ success: true }, 200, { "set-cookie": clearCookie });
}

async function selectBranches(request: Request, env: SitesEnv, db: D1Database) {
  const member = await authenticatedRequestMember(request, env);
  if (!member) return responseJson({ error: "ログインが必要です" }, 401);
  const input = await readJson(request);
  const branches = normalizeBranchSelection(input.branches);
  if (!branches)
    return responseJson({ error: "所属支部を1つ以上選択してください" }, 400);
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE members SET branches_json = ?, updated_at = ? WHERE id = ?",
      )
      .bind(JSON.stringify(branches), now, member.id),
    db
      .prepare(
        `INSERT INTO audit_logs
        (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, 'member.branches_updated', 'member', ?, ?, ?)`,
      )
      .bind(member.id, String(member.id), JSON.stringify({ branches }), now),
  ]);
  return responseJson({
    success: true,
    branch: branches[0],
    branches,
  });
}

type AccountDeletionRow = {
  id: string;
  status: "pending" | "cancelled" | "completed";
  source: "app" | "web";
  requested_at: string;
  scheduled_for: string;
  request_type?: "pause" | "withdrawal";
  square_action?: string | null;
  square_effective_date?: string | null;
};

function deletionPayload(row: AccountDeletionRow | null) {
  return row
    ? {
        id: row.id,
        status: row.status,
        source: row.source,
        requestedAt: row.requested_at,
        scheduledFor: row.scheduled_for,
        requestType: row.request_type ?? "withdrawal",
        squareAction: row.square_action ?? null,
        squareEffectiveDate: row.square_effective_date ?? null,
      }
    : null;
}

async function scheduleSquareMembershipChange(env: SitesEnv, subscriptionId: string, requestType: "pause" | "withdrawal", reason: string) {
  if (!env.SQUARE_ACCESS_TOKEN) throw new Error("Square連携が設定されていません");
  const action = requestType === "pause" ? "pause" : "cancel";
  const body = requestType === "pause" ? JSON.stringify({ pause_reason: reason.slice(0, 255) }) : undefined;
  const response = await fetch(`https://connect.squareup.com/v2/subscriptions/${encodeURIComponent(subscriptionId)}/${action}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "square-version": "2026-09-16", "content-type": "application/json" },
    body,
  });
  const result = await response.json().catch(() => ({})) as { subscription?: { id?: string; canceled_date?: string; charged_through_date?: string }; actions?: Array<{ type?: string; effective_date?: string }>; errors?: Array<{ detail?: string }> };
  if (!response.ok) throw new Error(result.errors?.[0]?.detail ?? "Squareの定期決済を変更できませんでした");
  if (!result.subscription || (result.subscription.id && result.subscription.id !== subscriptionId))
    throw new Error("Squareの処理結果を確認できませんでした。運営へお問い合わせください");
  if (requestType === "withdrawal" && !result.subscription.canceled_date)
    throw new Error("Squareの解約予約を確認できませんでした。運営へお問い合わせください");
  const pauseAction = requestType === "pause" ? result.actions?.find((item) => item.type === "PAUSE") : null;
  if (requestType === "pause" && !pauseAction)
    throw new Error("Squareの休止予約を確認できませんでした。運営へお問い合わせください");
  return { action: requestType === "pause" ? "pause_scheduled" : "cancel_scheduled", effectiveDate: pauseAction?.effective_date ?? result.subscription?.canceled_date ?? result.subscription?.charged_through_date ?? null };
}

async function accountDeletion(
  request: Request,
  env: SitesEnv,
  db: D1Database,
) {
  const token = extractSessionToken(request);
  const member = token ? await sessionMember(db, token) : null;
  if (!member || !membershipAllowsAccess(member, member))
    return responseJson({ error: "ログインが必要です" }, 401);

  if (request.method === "GET") {
    const pending = await db
      .prepare(
        `SELECT id, status, source, requested_at, scheduled_for, request_type, square_action, square_effective_date
         FROM account_deletion_requests
         WHERE member_id = ? AND status IN ('pending', 'completed')
         ORDER BY requested_at DESC LIMIT 1`,
      )
      .bind(member.id)
      .first<AccountDeletionRow>();
    return responseJson({ request: deletionPayload(pending) });
  }

  if (request.method === "POST") {
    const input = await readJson(request);
    const password = String(input.password ?? "");
    const requestType = input.requestType === "pause" ? "pause" : "withdrawal";
    const reasons = Array.isArray(input.reasons) ? input.reasons.filter((value: unknown): value is string => typeof value === "string").slice(0, 8) : [];
    const surveyComment = typeof input.surveyComment === "string" ? input.surveyComment.trim().slice(0, 1000) : "";
    const satisfactionValue = Number(input.satisfaction);
    const satisfaction = Number.isInteger(satisfactionValue) && satisfactionValue >= 1 && satisfactionValue <= 5 ? satisfactionValue : null;
    const satisfactionReason = typeof input.satisfactionReason === "string" ? input.satisfactionReason.trim().slice(0, 1000) : "";
    const expectationsMet = typeof input.expectationsMet === "string" ? input.expectationsMet.slice(0, 100) : "";
    const valuedFeatures = Array.isArray(input.valuedFeatures) ? input.valuedFeatures.filter((value: unknown): value is string => typeof value === "string").slice(0, 12) : [];
    const continuationCondition = typeof input.continuationCondition === "string" ? input.continuationCondition.trim().slice(0, 1000) : "";
    if (
      input.understandSquareChange !== true ||
      input.understandDataHandling !== true
    )
      return responseJson({ error: "確認事項への同意が必要です" }, 400);
    if (
      !member.password_hash ||
      !(await verifyPassword(password, member.password_hash, env.AUTH_SECRET))
    )
      return responseJson({ error: "パスワードが正しくありません" }, 401);
    if (!(await rateLimit(db, `account-deletion:${member.id}`, 5, 60)))
      return responseJson(
        { error: "操作回数が多すぎます。時間をおいてお試しください" },
        429,
      );
    const existing = await db
      .prepare(
        `SELECT id, status, source, requested_at, scheduled_for, request_type, square_action, square_effective_date
         FROM account_deletion_requests
         WHERE member_id = ? AND status = 'pending'
         ORDER BY requested_at DESC LIMIT 1`,
      )
      .bind(member.id)
      .first<AccountDeletionRow>();
    if (existing) return responseJson({ success: true, request: deletionPayload(existing) });

    let squareSubscriptionId = member.square_subscription_id;
    if (!squareSubscriptionId) {
      // Older imports may have an active Square customer but no stored
      // subscription ID. Resolve it from the already authenticated member's
      // billing email before rejecting the request.
      await discoverSquareMembership(db, env, normalizeEmail(member.email));
      const refreshedMember = await sessionMember(db, token!);
      squareSubscriptionId = refreshedMember?.square_subscription_id ?? null;
    }
    if (!squareSubscriptionId)
      return responseJson({ error: "Squareの定期決済情報が見つかりません。運営へお問い合わせください" }, 409);

    let squareChange: { action: string; effectiveDate: string | null };
    try {
      squareChange = await scheduleSquareMembershipChange(env, squareSubscriptionId, requestType, [...reasons, surveyComment].filter(Boolean).join(" / ") || "IRO+アプリからの手続き");
    } catch (error) {
      return responseJson({ error: error instanceof Error ? error.message : "Squareの定期決済を変更できませんでした" }, 502);
    }

    const now = new Date();
    const id = crypto.randomUUID();
    const source = input.source === "app" ? "app" : "web";
    const requestedAt = now.toISOString();
    const scheduledFor = accountDeletionDeadline(now).toISOString();
    await db.batch([
      db
        .prepare(
          `INSERT INTO account_deletion_requests
           (id, member_id, status, source, requested_at, scheduled_for, updated_at, request_type, survey_json, square_action, square_effective_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, member.id, requestType === "pause" ? "completed" : "pending", source, requestedAt, scheduledFor, requestedAt, requestType, JSON.stringify({ reasons, comment: surveyComment, satisfaction, satisfactionReason, expectationsMet, valuedFeatures, continuationCondition }), squareChange.action, squareChange.effectiveDate),
      db
        .prepare(
          `INSERT INTO audit_logs
           (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
           VALUES (?, 'member.account_deletion_requested', 'account_deletion', ?, ?, ?)`,
        )
        .bind(
          member.id,
          id,
          JSON.stringify({ source, scheduledFor, requestType, squareAction: squareChange.action, squareEffectiveDate: squareChange.effectiveDate }),
          requestedAt,
        ),
    ]);
    return responseJson(
      {
        success: true,
        request: deletionPayload({
          id,
          status: requestType === "pause" ? "completed" : "pending",
          source,
          requested_at: requestedAt,
          scheduled_for: scheduledFor,
          request_type: requestType,
          square_action: squareChange.action,
          square_effective_date: squareChange.effectiveDate,
        }),
      },
      202,
    );
  }

  if (request.method === "DELETE") {
    const pending = await db
      .prepare(
        `SELECT id, status, source, requested_at, scheduled_for, request_type, square_action, square_effective_date
         FROM account_deletion_requests
         WHERE member_id = ? AND status = 'pending'
         ORDER BY requested_at DESC LIMIT 1`,
      )
      .bind(member.id)
      .first<AccountDeletionRow>();
    if (!pending)
      return responseJson({ error: "申請中の削除依頼はありません" }, 404);
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          `UPDATE account_deletion_requests
           SET status = 'cancelled', cancelled_at = ?, updated_at = ?
           WHERE id = ? AND member_id = ? AND status = 'pending'`,
        )
        .bind(now, now, pending.id, member.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
           VALUES (?, 'member.account_deletion_cancelled', 'account_deletion', ?, NULL, ?)`,
        )
        .bind(member.id, pending.id, now),
    ]);
    return responseJson({ success: true, request: null });
  }

  return responseJson({ error: "not found" }, 404);
}

export async function handleAuthRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/auth/")) return null;
  if (!env.DB)
    return responseJson({ error: "データベースに接続できません" }, 503);
  if (request.method === "POST" && !isTrustedBrowserOrigin(request))
    return responseJson({ error: "許可されていない送信元です" }, 403);
  try {
    if (
      pathname === "/api/auth/request-setup-code" &&
      request.method === "POST"
    )
      return await requestSetupCode(request, env, env.DB);
    if (pathname === "/api/auth/register" && request.method === "POST")
      return await register(request, env, env.DB);
    if (pathname === "/api/auth/login" && request.method === "POST")
      return await login(request, env, env.DB);
    if (pathname === "/api/auth/me" && request.method === "GET")
      return await me(request, env.DB);
    if (pathname === "/api/auth/logout" && request.method === "POST")
      return await logout(request, env.DB);
    if (pathname === "/api/auth/branches" && request.method === "POST")
      return await selectBranches(request, env, env.DB);
    if (
      pathname === "/api/auth/account-deletion" &&
      ["GET", "POST", "DELETE"].includes(request.method)
    )
      return await accountDeletion(request, env, env.DB);
    return responseJson({ error: "not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "square_lookup_failed")
      return responseJson({ error: "Squareの会員情報を確認できませんでした。時間をおいて再試行し、解消しない場合は運営にお問い合わせください。" }, 503);
    if (message === "email_delivery_failed" || message === "email_not_configured")
      return responseJson({ error: "認証メールを送信できませんでした。時間をおいて再試行し、届かない場合は運営にお問い合わせください。" }, 503);
    if (message === "request_too_large")
      return responseJson({ error: "リクエストが大きすぎます" }, 413);
    if (message === "unsupported_media_type")
      return responseJson({ error: "JSON形式で送信してください" }, 415);
    if (message === "invalid_json")
      return responseJson({ error: "正しいJSON形式で送信してください" }, 400);
    return responseJson({ error: "一時的な問題が発生しました" }, 500);
  }
}
