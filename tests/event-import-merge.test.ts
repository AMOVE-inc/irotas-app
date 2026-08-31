import { describe, expect, it } from "vitest";
import { mergeImportedEvent, type ImportEventShape } from "../lib/event-import-merge";

function event(overrides: Partial<ImportEventShape> = {}): ImportEventShape {
  return { title: "既存イベント", eventDate: "2026-09-20", eventType: "gourmet", clubId: null, status: "open", publicData: { description: "アプリで編集した説明", comments: [{ id: "c1", text: "既存" }], image: "app.jpg" }, ...overrides };
}

describe("conflict-safe Discord event merge", () => {
  it("protects app-edited fields while appending new Discord comments", () => {
    const result = mergeImportedEvent(event(), event({ title: "Discordタイトル", publicData: { description: "Discord説明", comments: [{ id: "c1", text: "既存" }, { id: "c2", text: "追記" }], image: "discord.jpg" } }), new Set(["title", "description"]));
    expect(result.merged.title).toBe("既存イベント");
    expect(result.merged.publicData.description).toBe("アプリで編集した説明");
    expect(result.merged.publicData.comments).toHaveLength(2);
    expect(result.merged.publicData.image).toBe("discord.jpg");
    expect(result.conflicts.map((item) => item.field)).toEqual(["title", "description"]);
  });

  it("deduplicates append-only values by stable id", () => {
    const result = mergeImportedEvent(event(), event({ publicData: { comments: [{ id: "c1", text: "重複" }] } }), new Set());
    expect(result.merged.publicData.comments).toEqual([{ id: "c1", text: "既存" }]);
    expect(result.changedFields).not.toContain("comments");
  });
});
