import { describe, expect, it } from "vitest";
import { reconcileOptimisticReactions } from "../lib/chat-reactions";

describe("chat reaction refresh", () => {
  it("keeps an added reaction visible until the server catches up", () => {
    const pending = new Map([["❤️", true]]);
    const stale = reconcileOptimisticReactions({}, pending, "IRO0001");
    expect(stale.reactions).toEqual({ "❤️": ["IRO0001"] });
    expect(stale.remaining.size).toBe(1);
    const confirmed = reconcileOptimisticReactions({ "❤️": ["IRO0001"] }, stale.remaining, "IRO0001");
    expect(confirmed.remaining.size).toBe(0);
  });

  it("keeps a removed reaction hidden during a stale refresh", () => {
    const stale = reconcileOptimisticReactions({ "❤️": ["IRO0001", "IRO0002"] }, new Map([["❤️", false]]), "IRO0001");
    expect(stale.reactions).toEqual({ "❤️": ["IRO0002"] });
    expect(stale.remaining.size).toBe(1);
  });
});
