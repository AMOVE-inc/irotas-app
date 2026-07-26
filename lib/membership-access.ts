export type SquareSubscriptionStatus = "PENDING" | "ACTIVE" | "CANCELED" | "DEACTIVATED" | "PAUSED" | "COMPLETED" | "UNKNOWN";
export type MembershipAccessStatus = "pending" | "active" | "grace" | "suspended";

export type MembershipAccessRecord = {
  squareStatus: SquareSubscriptionStatus;
  accessStatus: MembershipAccessStatus;
  paidUntilDate?: string | Date | null;
  graceUntilDate?: string | Date | null;
};

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
  if (record.squareStatus !== "ACTIVE") return false;
  return !record.paidUntilDate || now.getTime() <= endOfDate(record.paidUntilDate);
}

export function accessStatusForSquareStatus(status: SquareSubscriptionStatus): MembershipAccessStatus {
  return status === "ACTIVE" ? "active" : status === "PENDING" ? "pending" : "suspended";
}
