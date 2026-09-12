import { describe, expect, it } from "vitest";
import { mergeEventComments } from "../sites/events";

const imported = [
  { id: "discord-comment-1", author: "A", authorId: "discord-111", text: "original", createdAt: "2026-09-01T00:00:00Z" },
  { id: "discord-comment-2", author: "B", authorId: "discord-222", text: "remove", createdAt: "2026-09-02T00:00:00Z" },
];

describe("shared event comments", () => {
  it("applies server edits and tombstones to imported comments for every viewer", () => {
    const stored = [
      { id: "discord-comment-1", event_id: "event-1", author_member_id: null, author_name: "A", author_public_id: "discord-111", content: "edited", created_at: "2026-09-01T00:00:00Z", deleted_at: null },
      { id: "discord-comment-2", event_id: "event-1", author_member_id: null, author_name: "B", author_public_id: "discord-222", content: "remove", created_at: "2026-09-02T00:00:00Z", deleted_at: "2026-09-03T00:00:00Z" },
    ];
    const viewer = { memberId: 9, publicId: "IRO0009", discordUserId: null, elevated: false };
    expect(mergeEventComments(imported, stored, viewer)).toEqual([
      { id: "discord-comment-1", author: "A", authorId: "discord-111", text: "edited", createdAt: "2026-09-01T00:00:00Z", canEdit: false },
    ]);
    expect(mergeEventComments(imported, stored, { ...viewer, memberId: 1, discordUserId: "111" })[0].canEdit).toBe(true);
  });

  it("shows server-created comments only to readers, with edit rights for their author", () => {
    const stored = [{ id: "ec_1", event_id: "event-1", author_member_id: 3, author_name: "C", author_public_id: "IRO0003", content: "hello", created_at: "2026-09-03T00:00:00Z", deleted_at: null }];
    expect(mergeEventComments([], stored, { memberId: 3, publicId: "IRO0003", discordUserId: null, elevated: false })[0].canEdit).toBe(true);
    expect(mergeEventComments([], stored, { memberId: 4, publicId: "IRO0004", discordUserId: null, elevated: false })[0].canEdit).toBe(false);
  });
});
