import { describe, expect, it } from "vitest";
import { japanDateKey } from "../lib/japan-date";

describe("Japan calendar day", () => {
  it("uses the new Japanese day before UTC midnight", () => {
    expect(japanDateKey(new Date("2026-09-12T15:42:00Z"))).toBe("2026-09-13");
    expect(japanDateKey(new Date("2026-09-12T14:59:59Z"))).toBe("2026-09-12");
  });
});
