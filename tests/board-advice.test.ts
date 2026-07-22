import { describe, expect, it } from "vitest";
import { BOARD_THREADS } from "../constants/mock-data";
import { GOURMET_ADVICE_BUDGETS } from "../lib/meal-report";

describe("gourmet advice format", () => {
  it("stores every consultation field and uses a selectable budget", () => {
    const adviceThreads = BOARD_THREADS.filter((thread) => thread.category === "gourmet-advice");
    expect(adviceThreads.length).toBeGreaterThan(0);
    for (const thread of adviceThreads) {
      expect(thread.gourmetAdvice?.theme).toBeTruthy();
      expect(thread.gourmetAdvice?.area).toBeTruthy();
      expect(thread.gourmetAdvice?.scene).toBeTruthy();
      expect(GOURMET_ADVICE_BUDGETS).toContain(thread.gourmetAdvice?.budget as typeof GOURMET_ADVICE_BUDGETS[number]);
      expect(thread.gourmetAdvice?.comment).toBeTruthy();
    }
  });
});
