import { describe, expect, it } from "vitest";
import { getConfirmedParticipantDisplayIds } from "../lib/event-confirmed-participants";

describe("confirmed participant presentation", () => {
  it("counts the organizer once alongside confirmed participants and companions", () => {
    const displayIds = getConfirmedParticipantDisplayIds(["host", "member", "member"], ["companion"], "host");
    expect(displayIds).toEqual(["host", "member", "companion"]);
    expect(displayIds).toHaveLength(3);
  });

  it("keeps companions separate when calculating the confirmed applicant count", () => {
    const companions = new Set(["companion"]);
    const confirmedApplicants = getConfirmedParticipantDisplayIds(["host", "member", "companion"], undefined, "host")
      .filter((memberId) => memberId !== "host" && !companions.has(memberId));
    expect(confirmedApplicants).toEqual(["member"]);
  });
});
