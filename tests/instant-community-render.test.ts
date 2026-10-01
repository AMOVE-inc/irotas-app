import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("instant board and chat rendering", () => {
  it("renders cached chat messages while the server refreshes in the background", () => {
    const chat = readFileSync("app/chat/index.tsx", "utf8");
    expect(chat).toContain("getCachedChatMessages(viewerMemberId, id");
    expect(chat).toContain("loadCachedChatMessages(viewerMemberId, id)");
    expect(chat).toContain("cacheChatMessages(viewerMemberId, id, shared)");
    expect(chat).not.toContain("自己紹介を読み込んでいます…");
  });

  it("persists the last confirmed chat list and keeps cache cleanup safe", () => {
    const list = readFileSync("components/chat-list-screen.tsx", "utf8");
    const cleanup = readFileSync("lib/cache-management.ts", "utf8");
    expect(list).toContain("loadChatListSnapshot(viewerMemberId)");
    expect(list).toContain("saveChatListSnapshot(viewerMemberId, snapshot)");
    expect(cleanup).toContain("clearChatListPersistentCache()");
    expect(cleanup).toContain("clearChatMessageCache()");
    expect(cleanup).toContain("clearBoardInstantCache()");
  });
});
