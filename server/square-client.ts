import type { SquareSubscriptionStatus } from "../lib/membership-access";

const SQUARE_API_BASE_URL = "https://connect.squareup.com/v2";
const SQUARE_API_VERSION = "2026-07-15";

type SquareCustomer = {
  id?: string;
  email_address?: string;
};

export type SquareSubscription = {
  id?: string;
  customer_id?: string;
  plan_variation_id?: string;
  status?: SquareSubscriptionStatus;
  paid_until_date?: string;
  created_at?: string;
};

export type SquareMembershipMatch = {
  customerId: string;
  subscriptionId: string;
  status: SquareSubscriptionStatus;
  paidUntilDate: string | null;
  planVariationId: string | null;
};

function configuredPlanIds(): Set<string> {
  return new Set(
    (process.env.SQUARE_ALLOWED_PLAN_VARIATION_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function statusPriority(status: SquareSubscriptionStatus | undefined): number {
  return ({ ACTIVE: 7, PENDING: 6, PAUSED: 5, DEACTIVATED: 4, CANCELED: 3, COMPLETED: 2, UNKNOWN: 1 } as const)[status ?? "UNKNOWN"];
}

/** Select the most relevant IRO+ subscription, preferring an active contract. */
export function selectSquareSubscription(
  subscriptions: SquareSubscription[],
  allowedPlanIds = configuredPlanIds(),
): SquareSubscription | undefined {
  return subscriptions
    .filter((subscription) => !allowedPlanIds.size || (subscription.plan_variation_id && allowedPlanIds.has(subscription.plan_variation_id)))
    .filter((subscription) => subscription.id && subscription.customer_id)
    .sort((a, b) => {
      const byStatus = statusPriority(b.status) - statusPriority(a.status);
      if (byStatus !== 0) return byStatus;
      return Date.parse(b.created_at ?? "1970-01-01") - Date.parse(a.created_at ?? "1970-01-01");
    })[0];
}

async function squarePost<T>(path: string, body: unknown): Promise<T> {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Square連携が設定されていません。運営へお問い合わせください。");
  const response = await fetch(`${SQUARE_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "square-version": SQUARE_API_VERSION,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json() as T & { errors?: { detail?: string }[] };
  if (!response.ok) {
    console.error("[Square] API request failed", path, response.status, result.errors);
    throw new Error("Squareの会員資格を確認できませんでした。しばらくしてから再度お試しください。");
  }
  return result;
}

export async function findMembershipByBillingEmail(email: string): Promise<SquareMembershipMatch | null> {
  if (process.env.NODE_ENV === "production" && configuredPlanIds().size === 0) {
    throw new Error("Squareの対象会費プランが設定されていません。運営へお問い合わせください。");
  }
  const normalizedEmail = email.toLowerCase().trim();
  const customerResponse = await squarePost<{ customers?: SquareCustomer[] }>("/customers/search", {
    query: { filter: { email_address: { exact: normalizedEmail } } },
    limit: 10,
  });
  const customer = customerResponse.customers?.find(
    (candidate) => candidate.id && candidate.email_address?.toLowerCase().trim() === normalizedEmail,
  );
  if (!customer?.id) return null;

  const subscriptionResponse = await squarePost<{ subscriptions?: SquareSubscription[] }>("/subscriptions/search", {
    query: { filter: { customer_ids: [customer.id] } },
    limit: 200,
  });
  const subscription = selectSquareSubscription(subscriptionResponse.subscriptions ?? []);
  if (!subscription?.id || !subscription.customer_id) return null;
  return {
    customerId: subscription.customer_id,
    subscriptionId: subscription.id,
    status: subscription.status ?? "UNKNOWN",
    paidUntilDate: subscription.paid_until_date ?? null,
    planVariationId: subscription.plan_variation_id ?? null,
  };
}
