import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const board = readFileSync("app/(tabs)/board.tsx", "utf8");
const chat = readFileSync("app/chat.tsx", "utf8");
const events = readFileSync("app/(tabs)/events.tsx", "utf8");

describe("responsive media and immediate list updates", () => {
  it("renders board galleries as cropped square three-column previews before reactions", () => {
    const detail = board.slice(board.indexOf("{/* 画像 */}"), board.indexOf("{/* 募集中バナー"));
    expect(board).toContain('{ width: "31.5%", aspectRatio: 1');
    expect(board).toContain('contentFit={thread.images!.length > 1 ? "cover" : "contain"}');
    expect(detail.indexOf("{/* 画像 */}")).toBeLessThan(detail.indexOf('accessibilityLabel="別の絵文字を追加"'));
  });

  it("renders multiple chat images in a two-column square grid", () => {
    expect(chat).toContain('flexDirection: "row", flexWrap: "wrap"');
    expect(chat).toContain("width: 108, height: 108");
    expect(chat).toContain('contentFit={tiled ? "cover" : "contain"}');
  });

  it("keeps category results hidden until their fresh request completes", () => {
    expect(board).toContain("const [categoryLoading, setCategoryLoading] = useState(false)");
    expect(board).toContain("archiveLoading || sharedLoading || categoryLoading");
  });

  it("updates the event favorite and its cache before awaiting the API", () => {
    const handler = events.slice(events.indexOf("const applyFavorite"), events.indexOf("locked={Boolean"));
    expect(handler.indexOf("applyFavorite(!favorite)")).toBeLessThan(handler.indexOf("Api.setEventFavorite"));
    expect(handler).toContain("eventListCache.set(authUser.id, next)");
  });
});
