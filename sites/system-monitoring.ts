import { authenticatedRequestMember } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";
import { isStrictAdmin } from "./operator-management";

const MONITORING_ENDPOINT = "/api/admin/system-monitoring";

type AuditRow = {
  id: number;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

type ErrorRow = {
  id: number;
  request_id: string;
  method: string;
  path: string;
  error_name: string;
  error_message: string;
  created_at: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function safeErrorDetails(error: unknown) {
  const name = error instanceof Error ? error.name : "Error";
  const rawMessage = error instanceof Error ? error.message : "Unexpected error";
  const redactedMessage = rawMessage
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(password|token|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;&]+/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[NUMBER_REDACTED]");
  return {
    name: name.replace(/[\r\n]/g, " ").slice(0, 80) || "Error",
    message: redactedMessage.replace(/[\r\n]/g, " ").slice(0, 500) || "Unexpected error",
  };
}

export function safeRequestPath(request: Request) {
  try {
    return new URL(request.url).pathname.slice(0, 500) || "/";
  } catch {
    return "/";
  }
}

export async function recordApplicationError(
  db: D1Database | undefined,
  request: Request,
  requestId: string,
  error: unknown,
) {
  if (!db) return;
  const details = safeErrorDetails(error);
  try {
    const createdAt = new Date().toISOString();
    const method = request.method.slice(0, 12);
    const path = safeRequestPath(request);
    await db.prepare(
      `INSERT OR IGNORE INTO application_errors
       (request_id, method, path, error_name, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      requestId,
      method,
      path,
      details.name,
      details.message,
      createdAt,
    ).run();
    // エラーは運営用の監視ログにのみ記録し、会員向けのアプリ内通知は作成しない。
  } catch {
    // Monitoring must never replace the original application response.
  }
}

export async function handleSystemMonitoringRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== MONITORING_ENDPOINT) return null;
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);

  const viewer = await authenticatedRequestMember(request, env);
  if (!viewer) return json({ error: "ログインが必要です" }, 401);
  if (!isStrictAdmin(viewer)) return json({ error: "管理者のみ閲覧できます" }, 403);

  const [audits, errors] = await Promise.all([
    env.DB.prepare(
      `SELECT a.id, a.actor_user_id, m.display_name AS actor_name,
              a.action, a.entity_type, a.entity_id, a.created_at
       FROM audit_logs a
       LEFT JOIN members m ON CAST(m.id AS TEXT) = a.actor_user_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 100`,
    ).all<AuditRow>(),
    env.DB.prepare(
      `SELECT id, request_id, method, path, error_name, error_message, created_at
       FROM application_errors
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
    ).all<ErrorRow>(),
  ]);

  return json({
    generatedAt: new Date().toISOString(),
    auditLogs: audits.results ?? [],
    applicationErrors: errors.results ?? [],
  });
}
