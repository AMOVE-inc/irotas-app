import { describe, expect, it } from "vitest";
import { getPublishedAgeBand } from "../lib/member-age";

describe("published age band", () => {
  const now = new Date("2026-08-15T12:00:00+09:00");

  it("shows only the first or second half of the decade", () => {
    expect(getPublishedAgeBand("2002-01-01", true, now)).toBe("20代前半");
    expect(getPublishedAgeBand("1998-01-01", true, now)).toBe("20代後半");
  });

  it("hides the age band when publication is disabled", () => {
    expect(getPublishedAgeBand("1998-01-01", false, now)).toBeNull();
  });
});
