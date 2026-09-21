import { authenticatedRequestMember, emailDeliveryConfigured, hasDiscordStaffRole, isTrustedBrowserOrigin, sendTransactionalEmail } from "./auth";
import type { D1Database, SitesEnv } from "./platform-types";

const SQUARE_VERSION = "2026-07-15";
const PAGE_SIZE = 200;
const MAX_PAGES = 100;

type SquareInvoice = {
  id?: string;
  invoice_number?: string;
  subscription_id?: string;
  status?: string;
  payment_requests?: { due_date?: string }[];
};

type SubscriptionBillingRow = {
  id: number;
  square_subscription_id: string;
  square_status: string;
  billing_status: string | null;
  access_status: string;
  billing_email: string;
  display_name: string | null;
  role: string | null;
  access_role: string | null;
  account_status: string | null;
  discord_roles_json: string | null;
};

function isBillingExempt(row: SubscriptionBillingRow) {
  return row.account_status === "active" && (
    row.role === "admin" || row.role === "operator" ||
    ["admin", "operator", "club_leader"].includes(row.access_role ?? "") ||
    hasDiscordStaffRole(row.discord_roles_json)
  );
}

function daysSince(date: string, today: string) {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(date)) / 86_400_000);
}

export function nextAutomaticFollowUp(today: string, initialSentAt: string | null, weekSent: boolean) {
  if (!initialSentAt) return "initial" as const;
  if (!weekSent && daysSince(tokyoDate(new Date(initialSentAt)), today) >= 7) return "week_1" as const;
  return null;
}

export function billingOverdueFollowUpMessage(displayName: string | null, type: "initial" | "week_1") {
  const greeting = displayName ? `${displayName} 様\n\n` : "";
  if (type === "week_1") return {
    subject: "【再案内／IRO+】会費のお支払い状況をご確認ください",
    text: `${greeting}いつもIRO+をご利用いただきありがとうございます。\n\n先日、IRO+会費のお支払いについてご案内しましたが、現在もお支払いを確認できていません。アプリへのログイン・閲覧は引き続き一時停止しています。\n\nカードの有効期限切れや、カード会社による決済停止などが原因の場合もあります。Squareから届いている請求書をご確認のうえ、未払い会費のお支払いまたは登録カードの更新をお願いいたします。\n\nお支払いが確認できましたら、通常15分以内にアプリを再びご利用いただけます。すでにお支払い済みの場合や、確認が必要な場合はIRO+運営までご連絡ください。\n\n今後ともIRO+をよろしくお願いいたします。\n\nIRO+運営事務局`,
  };
  return {
    subject: "【IRO+】会費のお支払い状況をご確認ください",
    text: `${greeting}いつもIRO+をご利用いただきありがとうございます。\n\n現在、IRO+会費のお支払い期限を過ぎていることを確認しました。そのため、アプリへのログイン・閲覧を一時停止しています。\n\nカードの有効期限切れや、カード会社による決済停止などが原因の場合もあります。Squareから届いている請求書をご確認のうえ、未払い会費のお支払いまたは登録カードの更新をお願いいたします。\n\nお支払いが確認できましたら、通常15分以内にアプリを再びご利用いただけます。すでにお支払い済みの場合は、行き違いとなり申し訳ございません。しばらく経ってもログインできない場合は、IRO+運営までご連絡ください。\n\n今後ともIRO+をよろしくお願いいたします。\n\nIRO+運営事務局`,
  };
}

export function overdueSubscriptionInvoices(invoices: SquareInvoice[], today: string) {
  const bySubscription = new Map<string, { count: number; invoiceNumbers: string[]; oldestDue: string }>();
  for (const invoice of invoices) {
    if (!invoice.subscription_id || !invoice.id || !["UNPAID", "PARTIALLY_PAID"].includes(invoice.status ?? "")) continue;
    const overdueDates = invoice.payment_requests?.map((request) => request.due_date ?? "").filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today) ?? [];
    if (!overdueDates.length) continue;
    const due = overdueDates.sort()[0];
    const existing = bySubscription.get(invoice.subscription_id) ?? { count: 0, invoiceNumbers: [], oldestDue: due };
    existing.count += 1;
    existing.invoiceNumbers.push(invoice.invoice_number ?? invoice.id);
    if (due < existing.oldestDue) existing.oldestDue = due;
    bySubscription.set(invoice.subscription_id, existing);
  }
  return bySubscription;
}

function tokyoDate(now: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function fetchSquareInvoices(token: string, locationId: string) {
  const invoices: SquareInvoice[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetch("https://connect.squareup.com/v2/invoices/search", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "square-version": SQUARE_VERSION },
      body: JSON.stringify({ query: { filter: { location_ids: [locationId] } }, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
    });
    if (!response.ok) throw new Error(`Square請求書照合に失敗しました (${response.status})`);
    const body = await response.json() as { invoices?: SquareInvoice[]; cursor?: string };
    invoices.push(...(body.invoices ?? []));
    if (!body.cursor) return invoices;
    cursor = body.cursor;
  }
  throw new Error("Square請求書がページ上限を超えました。会員状態を更新していません");
}

export async function reconcileOverdueInvoices(env: SitesEnv, now = new Date()) {
  if (!env.DB || !env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) return { skipped: true };
  const invoices = await fetchSquareInvoices(env.SQUARE_ACCESS_TOKEN, env.SQUARE_LOCATION_ID);
  if (!invoices.length) throw new Error("Square請求書が0件のため、会員状態を更新していません");
  const overdue = overdueSubscriptionInvoices(invoices, tokyoDate(now));
  const openSubscriptions = new Set(invoices.filter((invoice) =>
    invoice.subscription_id && ["UNPAID", "PARTIALLY_PAID"].includes(invoice.status ?? ""),
  ).map((invoice) => invoice.subscription_id as string));
  const rows = await env.DB.prepare(`SELECT s.id, s.square_subscription_id, s.square_status, s.billing_status,
    s.access_status, s.billing_email, m.display_name, m.role, m.access_role, m.account_status, m.discord_roles_json
    FROM member_subscriptions s LEFT JOIN members m ON m.id = s.member_id
    WHERE s.square_subscription_id IS NOT NULL AND s.square_subscription_id <> ''
      AND COALESCE(s.billing_status, '') NOT IN ('TEST_ACCOUNT', 'REVIEW_ACCOUNT')`).all<SubscriptionBillingRow>();
  const timestamp = now.toISOString();
  const overdueSubscriptions = (rows.results ?? []).filter((row) =>
    row.square_status === "ACTIVE" && overdue.has(row.square_subscription_id) && !isBillingExempt(row),
  ).length;
  const statements = (rows.results ?? []).flatMap((row) => {
    const finding = overdue.get(row.square_subscription_id);
    if (isBillingExempt(row)) {
      if (["PAYMENT_FAILED", "OVERDUE", "OVERDUE_BLOCKED"].includes(row.billing_status ?? "")) {
        return [env.DB!.prepare(`UPDATE member_subscriptions SET billing_status = 'CURRENT',
          overdue_since = NULL, grace_until_date = NULL, last_verified_at = ?, updated_at = ? WHERE id = ?`)
          .bind(timestamp, timestamp, row.id)];
      }
      return [];
    }
    if (finding && row.square_status === "ACTIVE" && row.billing_status !== "OVERDUE_BLOCKED") {
      return [env.DB!.prepare(`UPDATE member_subscriptions SET billing_status = ?,
        overdue_since = COALESCE(overdue_since, ?), grace_until_date = NULL,
        last_verified_at = ?, updated_at = ? WHERE id = ?`)
        .bind("OVERDUE_BLOCKED", finding.oldestDue, timestamp, timestamp, row.id)];
    }
    if (["OVERDUE", "OVERDUE_BLOCKED"].includes(row.billing_status ?? "") &&
      (!finding || row.square_status !== "ACTIVE")) {
      return [env.DB!.prepare(`UPDATE member_subscriptions SET billing_status = 'CURRENT',
        overdue_since = NULL, grace_until_date = NULL, last_verified_at = ?, updated_at = ? WHERE id = ?`)
        .bind(timestamp, timestamp, row.id)];
    }
    if (row.billing_status === "PAYMENT_FAILED" && !openSubscriptions.has(row.square_subscription_id)) {
      return [env.DB!.prepare(`UPDATE member_subscriptions SET billing_status = 'CURRENT',
        overdue_since = NULL, grace_until_date = NULL, last_verified_at = ?, updated_at = ? WHERE id = ?`)
        .bind(timestamp, timestamp, row.id)];
    }
    return [];
  });
  for (let offset = 0; offset < statements.length; offset += 100) await env.DB.batch(statements.slice(offset, offset + 100));
  let sentFollowUps = 0;
  if (emailDeliveryConfigured(env)) {
    for (const row of rows.results ?? []) {
      const finding = overdue.get(row.square_subscription_id);
      if (!finding || row.square_status !== "ACTIVE" || isBillingExempt(row)) continue;
      const previous = await env.DB.prepare(`SELECT follow_up_type, sent_at FROM billing_overdue_followups
        WHERE square_subscription_id = ? AND overdue_since = ? AND status = 'sent'`)
        .bind(row.square_subscription_id, finding.oldestDue)
        .all<{ follow_up_type: "initial" | "week_1"; sent_at: string | null }>();
      const initialSentAt = previous.results?.find((item) => item.follow_up_type === "initial")?.sent_at ?? null;
      const type = nextAutomaticFollowUp(tokyoDate(now), initialSentAt, Boolean(previous.results?.some((item) => item.follow_up_type === "week_1")));
      if (!type) continue;
      const existing = await env.DB.prepare(`SELECT status, attempted_at FROM billing_overdue_followups
        WHERE square_subscription_id = ? AND overdue_since = ? AND follow_up_type = ?`)
        .bind(row.square_subscription_id, finding.oldestDue, type).first<{ status: string; attempted_at: string }>();
      if (existing?.status === "sent" || (existing?.status === "pending" && now.getTime() - Date.parse(existing.attempted_at) < 30 * 60_000)) continue;
      await env.DB.prepare(`INSERT INTO billing_overdue_followups
        (square_subscription_id, overdue_since, follow_up_type, recipient_email, status, attempted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        ON CONFLICT(square_subscription_id, overdue_since, follow_up_type) DO UPDATE SET
          recipient_email = excluded.recipient_email, status = 'pending', attempted_at = excluded.attempted_at,
          error_message = NULL, updated_at = excluded.updated_at`)
        .bind(row.square_subscription_id, finding.oldestDue, type, row.billing_email, timestamp, timestamp, timestamp).run();
      const message = billingOverdueFollowUpMessage(row.display_name, type);
      try {
        await sendTransactionalEmail(env, {
          to: row.billing_email, subject: message.subject, text: message.text,
          idempotencyKey: `billing-overdue:${row.square_subscription_id}:${finding.oldestDue}:${type}`,
        });
        await env.DB.prepare(`UPDATE billing_overdue_followups SET status = 'sent', sent_at = ?, updated_at = ?
          WHERE square_subscription_id = ? AND overdue_since = ? AND follow_up_type = ?`)
          .bind(timestamp, timestamp, row.square_subscription_id, finding.oldestDue, type).run();
        sentFollowUps += 1;
      } catch (error) {
        await env.DB.prepare(`UPDATE billing_overdue_followups SET status = 'failed', error_message = ?, updated_at = ?
          WHERE square_subscription_id = ? AND overdue_since = ? AND follow_up_type = ?`)
          .bind(error instanceof Error ? error.message.slice(0, 255) : "email_delivery_failed", timestamp,
            row.square_subscription_id, finding.oldestDue, type).run();
      }
    }
  }
  return { scannedInvoices: invoices.length, overdueSubscriptions, updatedSubscriptions: statements.length, sentFollowUps };
}

export async function handleBillingOverdueRequest(request: Request, env: SitesEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/admin/billing-overdue")) return null;
  const member = await authenticatedRequestMember(request, env);
  if (!member) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (member.role !== "admin" && member.access_role !== "admin" && member.role !== "operator" && member.access_role !== "operator")
    return Response.json({ error: "運営・管理者のみ閲覧できます" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "会員DBが設定されていません" }, { status: 503 });
  if (request.method === "POST" && path === "/api/admin/billing-overdue/follow-up") {
    if (!isTrustedBrowserOrigin(request)) return Response.json({ error: "許可されていない送信元です" }, { status: 403 });
    if (member.role !== "admin" && member.access_role !== "admin") return Response.json({ error: "管理者のみ実行できます" }, { status: 403 });
    if (!emailDeliveryConfigured(env))
      return Response.json({ error: "メール送信が設定されていません" }, { status: 503 });
    const input = await request.json().catch(() => ({})) as { subscriptionId?: string };
    const subscriptionId = String(input.subscriptionId ?? "").trim();
    if (!subscriptionId || subscriptionId.length > 255) return Response.json({ error: "対象を確認できません" }, { status: 400 });
    const target = await env.DB.prepare(`SELECT s.billing_email, s.billing_status, s.overdue_since, m.display_name
      FROM member_subscriptions s LEFT JOIN members m ON m.id = s.member_id
      WHERE s.square_subscription_id = ? AND s.square_status = 'ACTIVE' AND s.billing_status IN ('PAYMENT_FAILED', 'OVERDUE_BLOCKED')
      LIMIT 1`).bind(subscriptionId).first<{ billing_email: string; billing_status: string; overdue_since: string | null; display_name: string | null }>();
    if (!target) return Response.json({ error: "現在フォロー対象の会員ではありません" }, { status: 409 });
    const subject = "【IRO+】会費のお支払い方法をご確認ください";
    const accessMessage = target.billing_status === "OVERDUE_BLOCKED"
      ? "現在アプリの閲覧を一時停止しています。"
      : "現時点ではアプリを閲覧できますが、期限超過になると閲覧を一時停止します。";
    const text = `${target.display_name ? `${target.display_name} 様\n\n` : ""}IRO+会費の決済が完了していないことを確認しました。${accessMessage}\n\nSquareから届いている請求書をご確認のうえ、お支払いまたは登録カードの更新をお願いいたします。カードの有効期限切れやカード会社による決済停止の場合もあります。\n\nお支払いの確認後、通常15分以内にアプリへ反映されます。行き違いでお支払い済みの場合はご容赦ください。`;
    const sentAt = new Date().toISOString();
    try {
      await sendTransactionalEmail(env, {
        to: target.billing_email,
        subject,
        text,
        idempotencyKey: `billing-overdue:${subscriptionId}:${sentAt.slice(0, 10)}`,
      });
    } catch {
      return Response.json({ error: "フォローメールを送信できませんでした" }, { status: 502 });
    }
    await env.DB.prepare(`INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, 'billing.overdue_follow_up_sent', 'member_subscription', ?, ?, ?)`)
      .bind(String(member.id), subscriptionId, JSON.stringify({ overdueSince: target.overdue_since }), sentAt).run();
    if (target.billing_status === "OVERDUE_BLOCKED" && target.overdue_since) {
      await env.DB.prepare(`INSERT INTO billing_overdue_followups
        (square_subscription_id, overdue_since, follow_up_type, recipient_email, status, attempted_at, sent_at, created_at, updated_at)
        VALUES (?, ?, 'initial', ?, 'sent', ?, ?, ?, ?)
        ON CONFLICT(square_subscription_id, overdue_since, follow_up_type) DO UPDATE SET
          recipient_email = excluded.recipient_email, status = 'sent', attempted_at = excluded.attempted_at,
          sent_at = excluded.sent_at, error_message = NULL, updated_at = excluded.updated_at`)
        .bind(subscriptionId, target.overdue_since, target.billing_email, sentAt, sentAt, sentAt, sentAt).run();
    }
    return Response.json({ success: true, sentAt });
  }
  if (request.method === "POST" && path === "/api/admin/billing-overdue") {
    if (!isTrustedBrowserOrigin(request)) return Response.json({ error: "許可されていない送信元です" }, { status: 403 });
    if (member.role !== "admin" && member.access_role !== "admin") return Response.json({ error: "管理者のみ実行できます" }, { status: 403 });
    if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID)
      return Response.json({ error: "Square連携が設定されていません" }, { status: 503 });
    try { return Response.json(await reconcileOverdueInvoices(env)); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "照合に失敗しました" }, { status: 502 }); }
  }
  if (request.method !== "GET" || path !== "/api/admin/billing-overdue") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const rows = await env.DB.prepare(`SELECT m.id AS member_id, m.display_name, m.public_member_id,
    s.billing_email, s.square_subscription_id, s.square_status, s.billing_status, s.access_status, s.overdue_since, s.last_verified_at
    FROM member_subscriptions s LEFT JOIN members m ON m.id = s.member_id
    WHERE s.billing_status IN ('PAYMENT_FAILED', 'OVERDUE', 'OVERDUE_BLOCKED') AND s.square_status = 'ACTIVE'
    ORDER BY s.overdue_since ASC, m.display_name ASC`).all();
  return Response.json({ members: rows.results ?? [] },
    { headers: { "cache-control": "no-store" } });
}
