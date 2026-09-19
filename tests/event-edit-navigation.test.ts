import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("event edit navigation", () => {
  it("replaces the detail history entry while editing so one back returns to the event list", () => {
    const detail = source("app/event-detail.tsx");
    const create = source("app/create-event.tsx");

    expect(detail).toContain('router.replace({ pathname: "/create-event", params: { editId: event.id } })');
    expect(create).toContain('router.replace({ pathname: "/event-detail", params: { id: updated.id } })');
    expect(create).toContain('router.replace({ pathname: "/event-detail", params: { id: editId } })');
    expect(create).toContain("<Pressable onPress={handleCancel}>");
  });
});
