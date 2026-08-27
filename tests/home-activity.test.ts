import { describe, expect, it } from "vitest";
import { initialHomeActivities } from "../lib/home-activity-store";

describe("home activity feed", () => {
  it("contains every requested automatic activity type", () => {
    const kinds = new Set(initialHomeActivities().map((activity) => activity.kind));
    expect(kinds).toEqual(new Set(["announcement", "event", "contest_thread", "contest_comment", "meal_report", "gourmet_advice", "free_chat"]));
    expect(kinds.has("introduction")).toBe(false);
  });

  it("links new events to their detail screen", () => {
    expect(initialHomeActivities().filter((activity) => activity.kind === "event").every((activity) => activity.route === "/event-detail" && activity.params?.id)).toBe(true);
  });
});
