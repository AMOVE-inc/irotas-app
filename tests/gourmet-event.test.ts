import { describe, expect, it } from "vitest";
import type { Event } from "../constants/mock-data";
import { approveGourmetApplication, cancelGourmetParticipation, getPendingGourmetApplicants, reopenGourmetRecruitment, submitGourmetApplication } from "../lib/gourmet-event";

const makeEvent = (): Event => ({
  id: "g1", title: "グルメ会", description: "説明", date: "2026-08-01", time: "18:00",
  location: "東京", image: "image", capacity: 2, attendees: 1, participants: ["host"],
  applicantIds: ["host"], price: "5,000円", category: "kanto", eventType: "gourmet",
  status: "open", createdBy: "host",
});

describe("gourmet event approval workflow", () => {
  it("keeps an applicant pending until the organizer approves them", () => {
    const event = makeEvent();
    submitGourmetApplication(event, "member");
    expect(getPendingGourmetApplicants(event)).toEqual(["member"]);
    expect(event.participants).toEqual(["host"]);

    approveGourmetApplication(event, "member");
    expect(event.participants).toEqual(["host", "member"]);
    expect(event.status).toBe("full");
    expect(getPendingGourmetApplicants(event)).toEqual([]);
  });

  it("lets the organizer cancel a participant and reopen recruitment", () => {
    const event = makeEvent();
    approveGourmetApplication(event, "member");
    cancelGourmetParticipation(event, "member");
    expect(event.participants).toEqual(["host"]);
    expect(event.applicantIds).toEqual(["host"]);
    expect(reopenGourmetRecruitment(event)).toBe(true);
    expect(event.status).toBe("open");
  });
});
