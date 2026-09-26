import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("home event cards", () => {
  const homeScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");

  it("uses compact cards and clearly masks club-only events", () => {
    expect(homeScreen).toContain("width: 148");
    expect(homeScreen).toContain('event.eventType === "club" ? 0.48 : 1');
    expect(homeScreen).toContain('`${event.clubName.replace(/部$/, "")}部員限定`');
  });
});
