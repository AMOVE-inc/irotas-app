import { describe, expect, it } from "vitest";
import { chatMentionMemberIds } from "../lib/chat-mention-scope";

describe("chat mention audience", () => {
  it("uses only active room members for every chat type", () => {
    expect(chatMentionMemberIds(["organizer", "guest"])).toEqual(["organizer", "guest"]);
  });

  it("does not fall back to the member directory when no one has joined", () => {
    expect(chatMentionMemberIds([])).toEqual([]);
  });

  it("deduplicates repeated room memberships", () => {
    expect(chatMentionMemberIds(["organizer", "guest", "organizer"])).toEqual(["organizer", "guest"]);
  });
});
