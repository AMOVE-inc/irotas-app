import { describe, expect, it } from "vitest";
import { displayEventTitle } from "../lib/event-title";

describe("displayEventTitle", () => {
  it("removes migration status labels and leading dates", () => {
    expect(displayEventTitle("【募集終了】 9/9(水)ビアガーデン🍺in六本木"))
      .toBe("ビアガーデン🍺in六本木");
    expect(displayEventTitle("【募集中】 10/28(水) 10月後半関東支部交流会"))
      .toBe("10月後半関東支部交流会");
  });
});
