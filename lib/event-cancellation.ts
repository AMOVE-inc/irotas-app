import type { Event } from "../constants/mock-data";

export function submitEventCancellationRequest(event: Event, memberId: string): void {
  const current = [...(event.cancellationRequests ?? [])];
  const existing = current.find((request) => request.memberId === memberId && request.status === "pending");
  if (existing) return;
  current.push({ memberId, requestedAt: new Date().toISOString(), contactedOrganizer: true, policyConfirmed: true, status: "pending" });
  event.cancellationRequests = current;
}

export function getPendingCancellationRequests(event: Event) {
  return (event.cancellationRequests ?? []).filter((request) => request.status === "pending");
}

export function approveEventCancellationRequest(event: Event, memberId: string): void {
  event.cancellationRequests = (event.cancellationRequests ?? []).map((request) => request.memberId === memberId && request.status === "pending" ? { ...request, status: "approved" as const } : request);
  event.participants = (event.participants ?? []).filter((id) => id !== memberId);
  event.applicantIds = (event.applicantIds ?? []).filter((id) => id !== memberId);
  event.attendees = event.applicantIds.length;
  event.status = "open";
}
