import type { Event } from "../constants/mock-data";

export function getPendingGourmetApplicants(event: Event): string[] {
  const confirmed = new Set(event.participants ?? []);
  return (event.applicantIds ?? []).filter((memberId) => !confirmed.has(memberId));
}

export function submitGourmetApplication(event: Event, memberId: string): void {
  const applicants = [...(event.applicantIds ?? [])];
  if (!applicants.includes(memberId)) applicants.push(memberId);
  event.applicantIds = applicants;
  event.attendees = applicants.length;
}

export function approveGourmetApplication(event: Event, memberId: string): void {
  submitGourmetApplication(event, memberId);
  const participants = [...(event.participants ?? [])];
  if (!participants.includes(memberId)) participants.push(memberId);
  event.participants = participants;
  event.status = participants.length >= event.capacity ? "full" : "open";
}

export function cancelGourmetParticipation(event: Event, memberId: string): void {
  event.participants = (event.participants ?? []).filter((id) => id !== memberId);
  event.applicantIds = (event.applicantIds ?? []).filter((id) => id !== memberId);
  event.attendees = event.applicantIds.length;
}

export function reopenGourmetRecruitment(event: Event): boolean {
  if ((event.participants ?? []).length >= event.capacity) return false;
  event.status = "open";
  return true;
}
