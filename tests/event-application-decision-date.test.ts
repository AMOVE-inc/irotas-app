import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const events = readFileSync("sites/events.ts", "utf8");

describe("event application decision date", () => {
  it("does not treat the planned participant-decision date as a hard application deadline", () => {
    expect(events).not.toContain('return responseJson({ error: "参加申込の受付期間は終了しました" }, 409)');
    expect(events).toContain('if (row.status !== "open" && recruitmentFinalized)');
  });
});
