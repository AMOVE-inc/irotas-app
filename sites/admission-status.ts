import type { D1Database, SitesEnv } from "./platform-types";

export type AdmissionReviewStatus = {
  status: "approved" | "rejected";
  expires_at: string | null;
};

export type MembershipAccessState = {
  billing_status?: string | null;
  access_status?: "pending" | "active" | "grace" | "suspended";
  square_status?: string | null;
} | null;

export async function findAdmissionReviewStatus(
  db: D1Database,
  email: string,
): Promise<AdmissionReviewStatus | null> {
  return db
    .prepare(
      "SELECT status, expires_at FROM admission_review_statuses WHERE LOWER(TRIM(email)) = ? LIMIT 1",
    )
    .bind(email.trim().toLowerCase())
    .first<AdmissionReviewStatus>();
}

export function admissionAccessError(
  review: AdmissionReviewStatus | null,
  subscription: MembershipAccessState,
  now = new Date(),
) {
  if (
    subscription?.billing_status === "OVERDUE_BLOCKED" ||
    subscription?.access_status === "suspended"
  ) {
    return {
      code: "MEMBERSHIP_PAYMENT_PROBLEM",
      message:
        "会費のお支払い状況を確認できないためログインできません。Squareから届いている請求書をご確認ください。",
    };
  }

  const approved =
    review?.status === "approved" &&
    (!review.expires_at || now.getTime() <= new Date(review.expires_at).getTime());
  if (approved) {
    return {
      code: "MEMBERSHIP_PAYMENT_REQUIRED",
      message:
        "入会審査は通過していますが、会費の決済完了を確認できません。合格メールの決済リンクからお支払いください。",
    };
  }

  return {
    code: "ADMISSION_NOT_APPROVED",
    message:
      "入会審査の通過を確認できません。審査完了後、通過された方にのみ別途メールにてご連絡させていただきます。",
  };
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function authorized(request: Request, secret: string | undefined) {
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function handleAdmissionStatusRequest(
  request: Request,
  env: SitesEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/api/internal/admission-status") return null;
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!env.DB || !env.ADMISSION_SYNC_TOKEN)
    return json({ error: "admission sync is not configured" }, 503);
  if (!authorized(request, env.ADMISSION_SYNC_TOKEN))
    return json({ error: "unauthorized" }, 401);

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "正しいJSON形式で送信してください" }, 400);
  }
  const email = String(input.email ?? "").trim().toLowerCase();
  const status = String(input.status ?? "");
  const decidedAt = String(input.decidedAt ?? "");
  const expiresAt = input.expiresAt == null ? null : String(input.expiresAt);
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    !["approved", "rejected"].includes(status) ||
    !Number.isFinite(new Date(decidedAt).getTime()) ||
    (expiresAt !== null && !Number.isFinite(new Date(expiresAt).getTime()))
  ) {
    return json({ error: "入力内容をご確認ください" }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO admission_review_statuses (email, status, decided_at, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET status = excluded.status,
       decided_at = excluded.decided_at, expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`,
  )
    .bind(email, status, decidedAt, status === "approved" ? expiresAt : null, now)
    .run();
  return json({ success: true });
}
