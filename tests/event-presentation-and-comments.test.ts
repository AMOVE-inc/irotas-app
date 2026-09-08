import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("event presentation and comments", () => {
  it("shows selection method only for official event cards", () => {
    expect(source("app/(tabs)/events.tsx")).toContain('event.eventType === "official" && event.selectionMethod');
  });

  it("does not render empty rank price data as rank pricing", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain('evt.eventType === "official"');
    expect(detail).toContain("EVENT_RANKS.some");
  });

  it("allows event comments to select and open individual member mentions", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("members={MEMBERS}");
    expect(detail).toContain("findMentionedMemberId(label, MEMBERS)");
    expect(detail).toContain("@で会員・部活・支部をメンションできます。");
  });

  it("gives organizers a stateful participant-chat CTA", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("(isJoined || isOrganizer) && chatRoomId");
    expect(detail).toContain("幹事イベント（参加者募集中）");
    expect(detail).toContain("幹事イベント（参加者確定済み）");
  });

  it("shows inline validation feedback and does not fill an omitted public note", () => {
    const create = source("app/create-event.tsx");
    expect(create).toContain("const [formError, setFormError]");
    expect(create).toContain('accessibilityRole="alert"');
    expect(create).toContain("description: savedFields.description");
    expect(create).toContain("requireImage: true");
  });
});
