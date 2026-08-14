import { describe, expect, it } from "vitest";
import { applyBoardThreadEdits } from "../lib/board-thread-edits";
import { BOARD_THREADS, type BoardThread } from "../constants/mock-data";

describe("applyBoardThreadEdits", () => {
  it("同じIDの移行済みスレに手修正内容を重ねる", () => {
    const source = BOARD_THREADS[0];
    const edited: BoardThread = {
      ...source,
      title: "手修正したタイトル",
      preview: "手修正した本文",
      images: ["https://example.com/replaced.jpg"],
    };

    const result = applyBoardThreadEdits([source], { [source.id]: edited });

    expect(result[0]).toEqual(edited);
  });

  it("手修正がないスレは移行データをそのまま返す", () => {
    const source = BOARD_THREADS[0];
    expect(applyBoardThreadEdits([source], {})[0]).toBe(source);
  });
});
