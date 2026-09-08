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
    expect(detail).toContain("memberDirectory.find");
    expect(detail).toContain("@で会員・部活・支部をメンションできます。");
  });

  it("keeps the detail screen in a loading state until its event lookup resolves", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("const [eventLoading, setEventLoading]");
    expect(detail).toContain("読み込み中…");
    expect(detail).toContain("setEventResolved(true)");
  });

  it("loads real member records for mention suggestions rather than rendering fixture members", () => {
    const mentionUi = source("components/mention-ui.tsx");
    expect(mentionUi).toContain("Api.getMemberDirectory()");
    expect(mentionUi).toContain("member.displayName");
    expect(mentionUi).toContain("memberIds?: readonly string[]");
  });

  it("gives organizers a stateful participant-chat CTA", () => {
    const detail = source("app/event-detail.tsx");
    expect(detail).toContain("(isJoined || isOrganizer) && chatRoomId");
    expect(detail).toContain("幹事イベント（参加者募集中）");
    expect(detail).toContain("幹事イベント（参加者確定済み）");
  });

  it("renders official system notices, day separators, and no avatar on outgoing chat messages", () => {
    const chat = source("app/chat.tsx");
    expect(chat).toContain('message.content.startsWith("【IRO+ システム】")');
    expect(chat).toContain('require("@/assets/images/irotas-logo-square.png")');
    expect(chat).toContain("!isMe && avatarSource");
    expect(chat).toContain("toLocaleDateString(\"ja-JP\"");
  });

  it("shows inline validation feedback and does not fill an omitted public note", () => {
    const create = source("app/create-event.tsx");
    expect(create).toContain("const [formError, setFormError]");
    expect(create).toContain('accessibilityRole="alert"');
    expect(create).toContain("description: savedFields.description");
    expect(create).toContain("requireImage: true");
  });
});
