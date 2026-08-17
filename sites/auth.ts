import type { D1Database, SitesEnv } from "./platform-types";

const encoder = new TextEncoder();
const SESSION_COOKIE = "__Host-irotas_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 600_000;

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
};

type SubscriptionRow = {
  billing_email: string;
  square_status: string;
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
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [scheme, iterationsText, saltText, expected] = encoded.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterationsText || !saltText || !expected)
    return false;
  const iterations = Number(iterationsText);
  if (
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000
  )
    return false;
  const salt = fromBase64Url(saltText);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
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

function endOfDate(value: string) {
  const key = value.slice(0, 10);
  return new Date(`${key}T23:59:59+09:00`).getTime();
}

export function membershipAllowsAccess(
  subscription: SubscriptionRow | null,
  member: Pick<MemberRow, "role" | "access_role" | "account_status">,
  now = new Date(),
) {
  if (member.account_status !== "active") return false;
  if (
    member.role === "admin" ||
    member.role === "operator" ||
    ["admin", "operator", "club_leader"].includes(member.access_role)
  )
    return true;
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
  return (
    subscription.square_status === "ACTIVE" &&
    (!subscription.paid_until_date ||
      now.getTime() <= endOfDate(subscription.paid_until_date))
  );
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

function memberPayload(row: MemberRow) {
  let branches: string[] = [];
  try {
    branches = JSON.parse(row.branches_json);
  } catch {}
  return {
    id: row.id,
    openId: `member:${row.id}`,
    name: row.display_name,
    email: row.email,
    loginMethod: "email",
    lastSignedIn: row.last_signed_in_at ?? new Date().toISOString(),
    role: row.role === "operator" ? "operator" : row.role,
    branch: branches[0] ?? null,
    branches,
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
  return (await request.json()) as Record<string, unknown>;
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
      "SELECT billing_email, square_status, access_status, paid_until_date, grace_until_date FROM member_subscriptions WHERE billing_email = ?",
    )
    .bind(email)
    .first<SubscriptionRow>();
}

async function findMember(db: D1Database, email: string) {
  return db
    .prepare(
      "SELECT id, email, password_hash, display_name, role, access_role, branches_json, account_status, last_signed_in_at FROM members WHERE email = ?",
    )
    .bind(email)
    .first<MemberRow>();
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
      `SELECT m.id, m.email, m.password_hash, m.display_name, m.role, m.access_role, m.branches_json, m.account_status, m.last_signed_in_at,
    s.billing_email, s.square_status, s.access_status, s.paid_until_date, s.grace_until_date
    FROM member_sessions ms
    JOIN members m ON m.id = ms.member_id
    LEFT JOIN member_subscriptions s ON s.member_id = m.id OR s.billing_email = m.email
    WHERE ms.token_hash = ? AND ms.expires_at > ?
    ORDER BY s.id DESC LIMIT 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionMemberRow>();
}

export async function requestHasMemberAccess(
  request: Request,
  env: SitesEnv,
  allowedAccessRoles?: Array<MemberRow["access_role"]>,
) {
  const member = await authenticatedRequestMember(request, env);
  if (!member) return false;
  if (!allowedAccessRoles?.length) return true;
  return (
    allowedAccessRoles.includes(member.access_role) ||
    member.role === "admin" ||
    member.role === "operator"
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

async function sendCode(env: SitesEnv, email: string, code: string) {
  if (!emailDeliveryConfigured(env)) throw new Error("email_not_configured");
  const subject = "IRO+ 初回認証コード";
  const text = `認証コードは ${code} です。有効期限は10分です。心当たりがない場合は、このメールを破棄してください。`;
  const idempotencyKey = await sha256(`initial-setup:${email}:${code}`);
  const response = env.EMAIL_DELIVERY_WEBHOOK_URL
    ? await fetch(env.EMAIL_DELIVERY_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.EMAIL_DELIVERY_WEBHOOK_TOKEN
            ? { authorization: `Bearer ${env.EMAIL_DELIVERY_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ to: email, subject, text }),
      })
    : await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          from: env.AUTH_EMAIL_FROM,
          to: [email],
          subject,
          text,
        }),
      });
  if (!response.ok) throw new Error("email_delivery_failed");
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
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (
    !(await rateLimit(db, `setup-email:${email}`, 5, 60)) ||
    !(await rateLimit(db, `setup-ip:${ip}`, 20, 60))
  )
    return responseJson({ success: true });
  const subscription = await findSubscription(db, email);
  const member = await findMember(db, email);
  const eligible = member
    ? membershipAllowsAccess(subscription, member)
    : Boolean(
        subscription &&
        subscription.access_status !== "suspended" &&
        subscription.access_status !== "pending",
      );
  if (!eligible) return responseJson({ success: true });
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
  } catch (error) {
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
  const name = String(input.name ?? "")
    .trim()
    .slice(0, 80);
  const code = String(input.verificationCode ?? "");
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 8 ||
    password.length > 128 ||
    !/^\d{6}$/.test(code)
  )
    return responseJson({ error: "入力内容をご確認ください" }, 400);
  const member = await findMember(db, email);
  const subscription = await findSubscription(db, email);
  if (!member || !membershipAllowsAccess(subscription, member))
    return responseJson({ error: "有効な会員資格を確認できません" }, 403);
  if (member.password_hash)
    return responseJson(
      { error: "初回設定済みです。ログインしてください" },
      409,
    );
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
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE members SET password_hash = ?, display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END, password_set_at = ?, last_signed_in_at = ?, updated_at = ? WHERE id = ?",
      )
      .bind(
        passwordHash,
        name || email.split("@")[0],
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
        "UPDATE member_subscriptions SET member_id = ?, updated_at = ? WHERE billing_email = ?",
      )
      .bind(member.id, now, email),
  ]);
  const updated = {
    ...member,
    password_hash: passwordHash,
    display_name: member.display_name || name || email.split("@")[0],
    last_signed_in_at: now,
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

async function login(request: Request, db: D1Database) {
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
    !(await verifyPassword(password, member.password_hash))
  )
    return responseJson(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      401,
    );
  const subscription = await findSubscription(db, email);
  if (!membershipAllowsAccess(subscription, member))
    return responseJson(
      { error: "会員資格を確認できないためログインできません" },
      403,
    );
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
  return responseJson({ success: true }, 200, {
    "set-cookie": clearSessionCookie(),
  });
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
      return requestSetupCode(request, env, env.DB);
    if (pathname === "/api/auth/register" && request.method === "POST")
      return register(request, env, env.DB);
    if (pathname === "/api/auth/login" && request.method === "POST")
      return login(request, env.DB);
    if (pathname === "/api/auth/me" && request.method === "GET")
      return me(request, env.DB);
    if (pathname === "/api/auth/logout" && request.method === "POST")
      return logout(request, env.DB);
    return responseJson({ error: "not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "request_too_large")
      return responseJson({ error: "リクエストが大きすぎます" }, 413);
    if (message === "unsupported_media_type")
      return responseJson({ error: "JSON形式で送信してください" }, 415);
    return responseJson({ error: "一時的な問題が発生しました" }, 500);
  }
}
