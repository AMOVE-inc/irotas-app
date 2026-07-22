import { describe, expect, it } from "vitest";
import { applyTextFormat } from "../lib/text-formatting";

describe("message text formatting", () => {
  it("wraps selected text with the requested format", () => {
    expect(applyTextFormat("おいしいです", { start: 0, end: 4 }, "bold").text).toBe("**おいしい**です");
    expect(applyTextFormat("おすすめ", { start: 0, end: 4 }, "underline").text).toBe("__おすすめ__");
    expect(applyTextFormat("変更前", { start: 0, end: 3 }, "strike").text).toBe("~~変更前~~");
  });

  it("supports small and large text markers", () => {
    expect(applyTextFormat("補足", { start: 0, end: 2 }, "small").text).toBe("[small]補足[/small]");
    expect(applyTextFormat("重要", { start: 0, end: 2 }, "large").text).toBe("[large]重要[/large]");
  });

  it("places the cursor inside empty markers when no text is selected", () => {
    const result = applyTextFormat("", { start: 0, end: 0 }, "bold");
    expect(result.text).toBe("****");
    expect(result.selection).toEqual({ start: 2, end: 2 });
  });
});
