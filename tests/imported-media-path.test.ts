import { describe, expect, it } from "vitest";
import { firstImportedMediaPaths, importedMediaPath } from "../lib/imported-media-path";

describe("archived Discord image paths", () => {
  it("uses a packaged attachment instead of its expired signed URL", () => {
    expect(importedMediaPath("https://cdn.discordapp.com/attachments/1543577576067436665/1543577576453181571/IMG_8424.jpg?ex=expired"))
      .toBe("/discord-board/1485587497374453870/1543577576453181571.webp");
    expect(importedMediaPath("https://cdn.discordapp.com/attachments/1/9999999999999999999/missing.jpg?ex=expired"))
      .toBeUndefined();
  });

  it("falls back to the archived event photo when a stored URL has expired", () => {
    expect(firstImportedMediaPaths(
      ["https://cdn.discordapp.com/attachments/1/9999999999999999999/missing.jpg?ex=expired"],
      ["https://cdn.discordapp.com/attachments/1543577576067436665/1543577576453181571/IMG_8424.jpg?ex=expired"],
    )).toEqual(["/discord-board/1485587497374453870/1543577576453181571.webp"]);
  });
});
