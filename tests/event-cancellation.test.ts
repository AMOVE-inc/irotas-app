import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { approveEventCancellationRequest, getPendingCancellationRequests, rejectEventCancellationRequest, submitEventCancellationRequest } from "../lib/event-cancellation";

const event = (): Event => ({ id: "e", title: "会", description: "", date: "2026-09-01", time: "18:00", location: "東京都", image: "", capacity: 2, attendees: 2, participants: ["u2"], applicantIds: ["u2"], price: "1,000円", category: "kanto", eventType: "gourmet", status: "full", createdBy: "u1" });

describe("event cancellation request", () => {
  it("submits one pending request and prevents duplicates", () => {
    const target = event();
    submitEventCancellationRequest(target, "u2");
    submitEventCancellationRequest(target, "u2");
    expect(getPendingCancellationRequests(target)).toHaveLength(1);
  });

  it("lets the organizer approve and reopen the seat", () => {
    const target = event();
    submitEventCancellationRequest(target, "u2");
    approveEventCancellationRequest(target, "u2");
    expect(target.participants).toEqual([]);
    expect(target.status).toBe("open");
    expect(getPendingCancellationRequests(target)).toHaveLength(0);
  });

  it("lets the organizer reject while keeping the participant confirmed", () => {
    const target = event();
    submitEventCancellationRequest(target, "u2");
    rejectEventCancellationRequest(target, "u2");
    expect(target.participants).toEqual(["u2"]);
    expect(target.status).toBe("full");
    expect(getPendingCancellationRequests(target)).toHaveLength(0);
    expect(target.cancellationRequests?.[0]?.status).toBe("rejected");
  });
});
