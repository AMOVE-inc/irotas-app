import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { expandingInputHeightForValue, expandingInputMetrics } from "../lib/expanding-input";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("expanding message and comment inputs", () => {
  it("starts at one line and stops growing after six lines", () => {
    expect(expandingInputMetrics(20)).toMatchObject({ minHeight: 40, maxHeight: 140, height: 40, scrollEnabled: false });
    expect(expandingInputMetrics(100)).toMatchObject({ height: 100, scrollEnabled: false });
    expect(expandingInputMetrics(140)).toMatchObject({ height: 140, scrollEnabled: true });
    expect(expandingInputMetrics(240)).toMatchObject({ height: 140, scrollEnabled: true });
  });

  it("keeps every explicit newline visible up to six lines even before a native size event", () => {
    expect(expandingInputHeightForValue("1行目")).toBe(40);
    expect(expandingInputHeightForValue("1行目\n2行目")).toBe(60);
    expect(expandingInputHeightForValue("1\n2\n3\n4\n5\n6")).toBe(140);
    expect(expandingInputHeightForValue("1\n2\n3\n4\n5\n6\n7")).toBe(140);
  });

  it.each([
    "app/chat/index.tsx",
    "app/(tabs)/board.tsx",
    "app/event-detail.tsx",
    "app/clubs.tsx",
    "app/(tabs)/index.tsx",
  ])("uses the shared six-line input in %s", (file) => {
    expect(source(file)).toContain("<ExpandingMessageInput");
  });

  it("allows timeline comments to insert newlines instead of submitting on Return", () => {
    const home = source("app/(tabs)/index.tsx");
    expect(home).toContain('submitBehavior="newline"');
    expect(home).not.toContain('returnKeyType="send"');
  });
});
