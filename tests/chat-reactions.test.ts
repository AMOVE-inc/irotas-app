import { describe, expect, it } from "vitest";
import { toggleReactionMember } from "../lib/chat-reactions";

describe("chat emoji reactions", () => {
  it("adds and removes a member reaction without changing the source", () => {
    const source = { "👍": ["u2"] };
    const added = toggleReactionMember(source, "👍", "u1");
    expect(added).toEqual({ "👍": ["u2", "u1"] });
    expect(source).toEqual({ "👍": ["u2"] });
    expect(toggleReactionMember(added, "👍", "u1")).toEqual({ "👍": ["u2"] });
  });

  it("removes an empty emoji bucket", () => {
    expect(toggleReactionMember({ "❤️": ["u1"] }, "❤️", "u1")).toEqual({});
  });
});
