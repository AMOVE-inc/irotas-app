import { describe, expect, it } from "vitest";
import { shouldUploadGiftImage } from "../lib/gift-campaign-image";

describe("gift campaign image saving", () => {
  it("does not re-upload existing archived or hosted images", () => {
    expect(shouldUploadGiftImage("/discord-benefits/gift-123.webp")).toBe(false);
    expect(shouldUploadGiftImage("/api/event-images/events%2F123.webp")).toBe(false);
    expect(shouldUploadGiftImage("https://example.com/gift.webp")).toBe(false);
  });

  it("uploads a newly selected local image", () => {
    expect(shouldUploadGiftImage("blob:https://app.irotas-community.com/123")).toBe(true);
    expect(shouldUploadGiftImage("file:///tmp/gift.jpg")).toBe(true);
  });
});
