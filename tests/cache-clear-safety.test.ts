import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("safe cache clear", () => {
  it("clears rebuildable caches without erasing storage or credentials", () => {
    const source = readFileSync("lib/cache-management.ts", "utf8");
    expect(source).toContain("clearDiskCache");
    expect(source).toContain("clearMemoryCache");
    expect(source).not.toContain("AsyncStorage.clear");
    expect(source).not.toContain("SecureStore");
  });
});
