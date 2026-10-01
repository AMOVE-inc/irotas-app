import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { expandingInputMetrics } from "../lib/expanding-input";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("expanding message and comment inputs", () => {
  it("starts at one line and stops growing after six lines", () => {
    expect(expandingInputMetrics(20)).toMatchObject({ minHeight: 40, maxHeight: 140, height: 40, scrollEnabled: false });
    expect(expandingInputMetrics(100)).toMatchObject({ height: 100, scrollEnabled: false });
    expect(expandingInputMetrics(140)).toMatchObject({ height: 140, scrollEnabled: true });
    expect(expandingInputMetrics(240)).toMatchObject({ height: 140, scrollEnabled: true });
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
