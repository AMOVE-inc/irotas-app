import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync("app/account-deletion.tsx", "utf8");

describe("account deletion satisfaction survey", () => {
  it("shows five descriptive satisfaction choices while preserving numeric values", () => {
    expect(screen).toContain('{ value: 1, label: "とても不満" }');
    expect(screen).toContain('{ value: 2, label: "不満" }');
    expect(screen).toContain('{ value: 3, label: "普通" }');
    expect(screen).toContain('{ value: 4, label: "満足" }');
    expect(screen).toContain('{ value: 5, label: "とても満足" }');
    expect(screen).toContain("setSatisfaction(option.value)");
    expect(screen).toContain('accessibilityRole="radio"');
  });
});
