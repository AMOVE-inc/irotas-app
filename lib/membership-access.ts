export type SquareSubscriptionStatus = "PENDING" | "ACTIVE" | "CANCELED" | "DEACTIVATED" | "PAUSED" | "COMPLETED" | "UNKNOWN";
export type MembershipAccessStatus = "pending" | "active" | "grace" | "suspended";

export type MembershipAccessRecord = {
  squareStatus: SquareSubscriptionStatus;
  accessStatus: MembershipAccessStatus;
  paidUntilDate?: string | Date | null;
  graceUntilDate?: string | Date | null;
};

export type SubscriptionExemptRole = "member" | "club_leader" | "operator" | "admin" | null | undefined;
export const PAYMENT_GRACE_DAYS = 7;

export function canBypassSubscription(userRole: unknown, accessRole: SubscriptionExemptRole): boolean {
  return userRole === "admin" || userRole === "operator" || accessRole === "admin" || accessRole === "operator" || accessRole === "club_leader";
}

function endOfDate(value: string | Date): number {
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return new Date(`${key}T23:59:59+09:00`).getTime();
}

export function canAccessMemberApp(record: MembershipAccessRecord | null | undefined, now = new Date()): boolean {
  if (!record) return false;
  if (record.accessStatus === "suspended" || record.accessStatus === "pending") return false;
  if (record.accessStatus === "grace") {
    return Boolean(record.graceUntilDate && now.getTime() <= endOfDate(record.graceUntilDate));
  }
  return record.squareStatus === "ACTIVE";
}

export function accessStatusForSquareStatus(status: SquareSubscriptionStatus): MembershipAccessStatus {
  return status === "ACTIVE" ? "active" : status === "PENDING" ? "pending" : "suspended";
}

export function addGraceDays(value: string | Date, days = PAYMENT_GRACE_DAYS): Date {
  const key = value instanceof Date
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value)
    : value.slice(0, 10);
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function accessStateForBilling(
  status: SquareSubscriptionStatus,
  billingStatus?: string | null,
  overdueSince?: string | Date | null,
): { accessStatus: MembershipAccessStatus; graceUntilDate: Date | null } {
  if (status === "PAUSED") return { accessStatus: "suspended", graceUntilDate: null };
  if (status !== "ACTIVE") return { accessStatus: accessStatusForSquareStatus(status), graceUntilDate: null };
  const normalizedBillingStatus = billingStatus?.trim().toUpperCase();
  if (normalizedBillingStatus === "期限超過" || normalizedBillingStatus === "OVERDUE") {
    return { accessStatus: "grace", graceUntilDate: overdueSince ? addGraceDays(overdueSince) : addGraceDays(new Date()) };
  }
  return { accessStatus: "active", graceUntilDate: null };
}
