import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auth = readFileSync("lib/auth-context.tsx", "utf8");

describe("live authenticated member refresh", () => {
  it("updates XP without requiring a page reload", () => {
    expect(auth).toContain("refreshCurrentUser");
    expect(auth).toContain("setInterval(() => { void refreshCurrentUser(); }, 15_000)");
    expect(auth).toContain('document.addEventListener("visibilitychange"');
    expect(auth).toContain('state === "active"');
    expect(auth).toContain("current.xp === userInfo.xp");
  });
});
