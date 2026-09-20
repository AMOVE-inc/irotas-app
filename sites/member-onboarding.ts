import { authenticatedRequestMember } from "./auth";
import type { SitesEnv } from "./platform-types";

const PATH = "/api/admin/member-onboarding";
const FOLLOW_UP_PATH = "/api/admin/member-onboarding/follow-up";

type OnboardingRow = {
  subscription_id: number;
  billing_email: string;
  access_status: "active" | "grace";
  square_status: string;
  paid_until_date: string | null;
  grace_until_date: string | null;
  linked_member_id: number | null;
  member_id: number | null;
  member_email: string | null;
  public_member_id: string | null;
  display_name: string | null;
  account_status: string | null;
  is_test_account: number | null;
  password_set_at: string | null;
  last_signed_in_at: string | null;
  code_issued_at: string | null;
  outreach_status: "not_sent" | "sent" | "follow_up" | null;
  sent_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  owner_name: string | null;
  issue_note: string | null;
  excluded_from_follow_up: number | null;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function optionalTimestamp(value: unknown) {
  if (value === null || value === "") return null;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function optionalDate(value: unknown) {
  if (value === null || value === "") return null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : undefined;
}

export function onboardingLoginStatus(row: Pick<OnboardingRow, "member_id" | "account_status" | "password_set_at" | "last_signed_in_at" | "code_issued_at">) {
  if (row.member_id === null || row.account_status !== "active") return "needs_attention" as const;
  if (row.last_signed_in_at) return "logged_in" as const;
  if (row.password_set_at) return "password_set" as const;
  if (row.code_issued_at) return "code_requested" as const;
  return "not_started" as const;
}

function memberPayload(row: OnboardingRow) {
  const loginStatus = onboardingLoginStatus(row);
  const linkIssue = row.linked_member_id !== row.member_id ||
    (row.member_email !== null && normalizedEmail(row.member_email) !== normalizedEmail(row.billing_email));
  return {
    subscriptionId: row.subscription_id,
    billingEmail: row.billing_email,
    subscriptionStatus: row.access_status,
    squareStatus: row.square_status,
    paidUntilDate: row.paid_until_date,
    graceUntilDate: row.grace_until_date,
    memberId: row.public_member_id,
    displayName: row.display_name,
    accountStatus: row.account_status,
    isTestAccount: row.is_test_account === 1,
    linkIssue,
    loginStatus,
    passwordSetAt: row.password_set_at,
    lastSignedInAt: row.last_signed_in_at,
    codeIssuedAt: row.code_issued_at,
    followUp: {
      outreachStatus: row.outreach_status ?? "not_sent",
      sentAt: row.sent_at,
      lastContactAt: row.last_contact_at,
      nextFollowUpAt: row.next_follow_up_at,
      ownerName: row.owner_name ?? "",
      issueNote: row.issue_note ?? "",
      excludedFromFollowUp: row.excluded_from_follow_up === 1,
    },
  };
}

export async function handleMemberOnboardingRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== PATH && pathname !== FOLLOW_UP_PATH) return null;
  if (!env.DB) return json({ error: "データベースに接続できません" }, 503);
  const admin = await authenticatedRequestMember(request, env);
  if (!admin) return json({ error: "ログインが必要です" }, 401);
  if (admin.role !== "admin" && admin.access_role !== "admin") return json({ error: "管理者のみ操作できます" }, 403);

  if (pathname === PATH) {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const result = await env.DB.prepare(`
      SELECT s.id AS subscription_id, LOWER(TRIM(s.billing_email)) AS billing_email,
             s.access_status, s.square_status, s.paid_until_date, s.grace_until_date,
             s.member_id AS linked_member_id,
             m.id AS member_id, m.email AS member_email, m.public_member_id, m.display_name, m.account_status,
             CASE WHEN json_valid(m.profile_json) THEN COALESCE(json_extract(m.profile_json, '$.isTestAccount'), 0) ELSE 0 END AS is_test_account,
             m.password_set_at, m.last_signed_in_at,
             (SELECT MAX(c.created_at) FROM email_verification_codes c
              WHERE LOWER(TRIM(c.email)) = LOWER(TRIM(s.billing_email))
                AND c.purpose = 'initial_setup') AS code_issued_at,
             f.outreach_status, f.sent_at, f.last_contact_at, f.next_follow_up_at,
             f.owner_name, f.issue_note, f.excluded_from_follow_up
      FROM member_subscriptions s
      LEFT JOIN members m ON m.id = s.member_id OR (s.member_id IS NULL AND LOWER(TRIM(m.email)) = LOWER(TRIM(s.billing_email)))
      LEFT JOIN member_onboarding_followups f ON f.billing_email = LOWER(TRIM(s.billing_email))
      WHERE s.access_status IN ('active', 'grace')
        AND COALESCE(s.billing_status, '') <> 'TEST_ACCOUNT'
      ORDER BY CASE WHEN m.last_signed_in_at IS NULL THEN 0 ELSE 1 END,
               LOWER(TRIM(s.billing_email))
    `).all<OnboardingRow>();
    const members = (result.results ?? []).map(memberPayload);
    return json({ members, updatedAt: new Date().toISOString() });
  }

  if (request.method !== "PUT") return json({ error: "method_not_allowed" }, 405);
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "入力内容を確認してください" }, 400); }
  const email = normalizedEmail(input.billingEmail);
  const status = input.outreachStatus;
  const sentAt = optionalTimestamp(input.sentAt);
  const lastContactAt = optionalTimestamp(input.lastContactAt);
  const nextFollowUpAt = optionalDate(input.nextFollowUpAt);
  const ownerName = typeof input.ownerName === "string" ? input.ownerName.trim() : "";
  const issueNote = typeof input.issueNote === "string" ? input.issueNote.trim() : "";
  const excludedFromFollowUp = input.excludedFromFollowUp;
  if (!/^\S+@\S+\.\S+$/.test(email) || !["not_sent", "sent", "follow_up"].includes(String(status)) ||
      sentAt === undefined || lastContactAt === undefined || nextFollowUpAt === undefined ||
      ownerName.length > 80 || issueNote.length > 1000 || typeof excludedFromFollowUp !== "boolean")
    return json({ error: "入力内容を確認してください" }, 400);
  const eligible = await env.DB.prepare(`SELECT 1 AS found FROM member_subscriptions
    WHERE LOWER(TRIM(billing_email)) = ? AND access_status IN ('active', 'grace')
      AND COALESCE(billing_status, '') <> 'TEST_ACCOUNT' LIMIT 1`).bind(email).first<{ found: number }>();
  if (!eligible) return json({ error: "対象の有効なサブスクが見つかりません" }, 404);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO member_onboarding_followups
    (billing_email, outreach_status, sent_at, last_contact_at, next_follow_up_at, owner_name, issue_note, excluded_from_follow_up, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(billing_email) DO UPDATE SET
      outreach_status = excluded.outreach_status, sent_at = excluded.sent_at,
      last_contact_at = excluded.last_contact_at, next_follow_up_at = excluded.next_follow_up_at,
      owner_name = excluded.owner_name, issue_note = excluded.issue_note,
      excluded_from_follow_up = excluded.excluded_from_follow_up, updated_at = excluded.updated_at`)
    .bind(email, status, sentAt, lastContactAt, nextFollowUpAt, ownerName, issueNote, excludedFromFollowUp ? 1 : 0, now).run();
  return json({ success: true });
}
