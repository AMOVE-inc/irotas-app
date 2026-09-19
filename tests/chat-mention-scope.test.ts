import { describe, expect, it } from "vitest";
import { chatMentionMemberIds } from "../lib/chat-mention-scope";

const directory = [
  { id: "organizer", branches: ["kanto"], memberRank: "gold" },
  { id: "guest", branches: ["kansai"], memberRank: "silver" },
  { id: "outsider", branches: ["kanto"], memberRank: "gold" },
];

describe("chat mention audience", () => {
  it("uses the active chat participants for an event even when outsiders are in the member directory", () => {
    expect(chatMentionMemberIds(
      { id: "event_chat_event-1", type: "event" },
      ["organizer", "guest"],
      directory,
    )).toEqual(["organizer", "guest"]);
  });

  it("keeps the audience of an open chat and a branch chat available", () => {
    expect(chatMentionMemberIds(
      { id: "community-free-chat", type: "board" }, [], directory,
    )).toEqual(["organizer", "guest", "outsider"]);
    expect(chatMentionMemberIds(
      { id: "branch-kanto-free", type: "board" }, [], directory,
    )).toEqual(["organizer", "outsider"]);
  });

  it("allows members at or above a rank chat's required rank", () => {
    expect(chatMentionMemberIds(
      { id: "rank-silver", type: "rank", requiredRank: "silver" }, [], directory,
    )).toEqual(["organizer", "guest", "outsider"]);
  });
});
