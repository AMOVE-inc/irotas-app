import { describe, expect, it } from "vitest";
import { CURRENT_USER } from "../constants/mock-data";
import { mergeGourmetMapRestaurants, previewGourmetMapCsv } from "../lib/gourmet-map-csv";

const headers = "Name,Description,Fulladdress,Street,Municipality,Categories,About,Plus Code,Time Zone,Price,Note,Amenities,Hotel Class,Phone,Phones,Claimed,Owner,Owner Id,Owner Link,Email,Social Medias,Review Count,Average Rating,Review URL,Google Maps URL,Google Knowledge URL,Latitude,Longitude,Website,Domain,Opening Hours,Featured Image,Cid,Fid,Place Id,Kgmid";
const headerNames = headers.split(",");
function csvRow(overrides: Record<string, string>) {
  return headerNames.map((header) => `"${(overrides[header] ?? "").replaceAll('"', '""')}"`).join(",");
}

const validRow = (overrides: Record<string, string> = {}) => csvRow({
  Name: "店A", Fulladdress: "東京都千代田区", Categories: "居酒屋", "Review Count": "10", "Average Rating": "4.2",
  "Google Maps URL": "https://maps.google.com/a", Latitude: "35.6", Longitude: "139.7", "Featured Image": "https://example.com/a.jpg", "Place Id": "place-a",
  ...overrides,
});

describe("G Maps Extractor CSV import", () => {
  it("parses quoted embedded newlines and maps a restaurant", () => {
    const csv = `${headers}\n${validRow({ Name: "居酒屋テスト", Fulladdress: "〒100-0001 東京都千代田区1-1", Price: "￥5,000～6,000", Note: "一行目\n二行目", Phone: "03-0000-0000", "Review Count": "86", "Average Rating": "4.4", "Google Maps URL": "https://www.google.com/maps?cid=1", "Featured Image": "https://example.com/image.jpg", "Place Id": "place-1" })}`;
    const result = previewGourmetMapCsv(csv, "居酒屋", CURRENT_USER);
    expect(result.total).toBe(1);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({ name: "居酒屋テスト", genre: "居酒屋", placeId: "place-1", rating: 4.4 });
  });

  it("separates invalid and duplicate rows", () => {
    const good = `${headers}\n${validRow()}`;
    const first = previewGourmetMapCsv(good, "居酒屋", CURRENT_USER);
    const duplicate = previewGourmetMapCsv(good, "居酒屋", CURRENT_USER, first.valid);
    expect(first.valid).toHaveLength(1);
    expect(duplicate.duplicateCount).toBe(1);

    const noRating = `${headers}\n${validRow({ "Average Rating": "" })}`;
    expect(previewGourmetMapCsv(noRating, "居酒屋", CURRENT_USER).errors[0].reasons).toContain("Google評価がありません");
  });

  it("merges by Place ID without adding duplicates", () => {
    const one = previewGourmetMapCsv(`${headers}\n${validRow()}`, "居酒屋", CURRENT_USER).valid;
    expect(mergeGourmetMapRestaurants(one, one)).toHaveLength(1);
  });
});
