import { describe, expect, it } from "vitest";
import { getPublishedAgeBand } from "../lib/member-age";

describe("published age", () => {
  const now = new Date("2026-08-15T12:00:00+09:00");

  it("shows the exact age without exposing the birth date", () => {
    expect(getPublishedAgeBand("2002-01-01", true, now)).toBe("24歳");
    expect(getPublishedAgeBand("1998-01-01", true, now)).toBe("28歳");
  });

  it("hides the age when publication is disabled", () => {
    expect(getPublishedAgeBand("1998-01-01", false, now)).toBeNull();
  });
});
