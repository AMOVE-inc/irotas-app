import { describe, expect, it } from "vitest";

import { eventCancellationDisplayIds } from "../sites/events";

const participation = (status: "applied" | "confirmed" | "cancel_requested" | "cancelled" | "rejected") => ({
  event_id: "event-1",
  member_id: 10,
  public_member_id: "IRO0010",
  status,
});

const approvedCancellation = {
  event_id: "event-1",
  member_id: 10,
  public_member_id: "IRO0010",
  requested_at: "2026-10-02T00:00:00.000Z",
  contacted_organizer: 1,
  policy_confirmed: 1,
  status: "approved" as const,
};

describe("event cancellation presentation", () => {
  it("keeps the approved history but hides it while the member is participating again", () => {
    expect(eventCancellationDisplayIds([participation("confirmed")], [approvedCancellation])).toEqual([]);
    expect(eventCancellationDisplayIds([participation("applied")], [approvedCancellation])).toEqual([]);
  });

  it("shows an approved cancellation while the member remains cancelled", () => {
    expect(eventCancellationDisplayIds([participation("cancelled")], [approvedCancellation])).toEqual(["IRO0010"]);
  });

  it("still shows participants when the whole event is cancelled", () => {
    expect(eventCancellationDisplayIds([participation("confirmed")], [approvedCancellation], ["IRO0010"])).toEqual(["IRO0010"]);
  });
});
