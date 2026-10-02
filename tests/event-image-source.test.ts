import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasEventImageSource } from "../lib/event-image-source";

describe("event image sources", () => {
  it("uses only the image explicitly assigned to the event", () => {
    expect(hasEventImageSource({ image: "/api/event-images/events%2Fmanual.jpg" })).toBe(true);
  });

  it("does not treat restaurant links as an event image source", () => {
    expect(hasEventImageSource({ image: "" })).toBe(false);
  });

  it("does not request an external link preview when an event image is missing", () => {
    const component = readFileSync("components/event-image.tsx", "utf8");
    expect(component).not.toContain("/api/link-preview");
    expect(component).not.toContain("tabelogUrl");
    expect(component).not.toContain("googleMapsUrl");
  });
});
