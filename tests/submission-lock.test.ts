import { describe, expect, it } from "vitest";
import { acquireSubmissionLock, releaseSubmissionLock } from "../lib/submission-lock";

describe("submission lock", () => {
  it("allows only the first of consecutive submit attempts", () => {
    const lock = { current: false };

    expect(acquireSubmissionLock(lock)).toBe(true);
    expect(acquireSubmissionLock(lock)).toBe(false);
    expect(acquireSubmissionLock(lock)).toBe(false);
  });

  it("allows retry after the pending operation finishes", () => {
    const lock = { current: false };

    expect(acquireSubmissionLock(lock)).toBe(true);
    releaseSubmissionLock(lock);
    expect(acquireSubmissionLock(lock)).toBe(true);
  });
});
