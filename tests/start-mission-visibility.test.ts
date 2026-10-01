import { describe, expect, it } from "vitest";
import { visibleStartMissionSteps } from "../lib/start-mission-visibility";

describe("start mission visibility", () => {
  const steps = [
    { key: "profile", completed: true },
    { key: "introduction", completed: false },
    { key: "event_application", completed: true },
  ] as const;

  it("shows only unfinished missions by default", () => {
    expect(visibleStartMissionSteps(steps, false).map((step) => step.key)).toEqual(["introduction"]);
  });

  it("shows completed missions after the user expands them", () => {
    expect(visibleStartMissionSteps(steps, true)).toEqual(steps);
  });
});
