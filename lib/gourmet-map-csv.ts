import { parseCsv } from "./migration-csv";
import type { Restaurant } from "../constants/mock-data";

const REQUIRED_HEADERS = ["Name", "Fulladdress", "Categories", "Average Rating", "Review Count", "Google Maps URL", "Latitude", "Longitude", "Featured Image", "Place Id"] as const;

export type GourmetMapImportError = { row: number; name: string; reasons: string[] };
export type GourmetMapImportPreview = {
  total: number;
  valid: Restaurant[];
  duplicateCount: number;
  errors: GourmetMapImportError[];
  missingHeaders: string[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function duplicateKey(restaurant: Pick<Restaurant, "placeId" | "googleMapsUrl" | "name" | "address">) {
  return restaurant.placeId || restaurant.googleMapsUrl || `${restaurant.name}\u0000${restaurant.address}`;
}

export function previewGourmetMapCsv(
  csv: string,
  sourceList: string,
  registeredBy: Restaurant["registeredBy"],
  existingRestaurants: Restaurant[] = [],
  importedAt = new Date().toISOString(),
): GourmetMapImportPreview {
  const rows = parseCsv(csv);
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) return { total: rows.length, valid: [], duplicateCount: 0, errors: [], missingHeaders: [...missingHeaders] };

  const knownKeys = new Set(existingRestaurants.map(duplicateKey));
  const valid: Restaurant[] = [];
  const errors: GourmetMapImportError[] = [];
  let duplicateCount = 0;

  rows.forEach((row, index) => {
    const name = text(row.Name);
    const address = text(row.Fulladdress);
    const placeId = text(row["Place Id"]);
    const googleMapsUrl = text(row["Google Maps URL"]);
    const image = text(row["Featured Image"]);
    const latitude = Number(row.Latitude);
    const longitude = Number(row.Longitude);
    const rating = Number(row["Average Rating"]);
    const reasons: string[] = [];
    if (!name) reasons.push("店名がありません");
    if (!address) reasons.push("住所がありません");
    if (!placeId) reasons.push("Place IDがありません");
    if (!/^https:\/\//.test(googleMapsUrl)) reasons.push("GoogleマップURLが不正です");
    if (!/^https:\/\//.test(image)) reasons.push("画像URLが不正です");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) reasons.push("座標が不正です");
    if (!Number.isFinite(rating) || rating <= 0 || rating > 5) reasons.push("Google評価がありません");
    if (reasons.length > 0) { errors.push({ row: index + 2, name: name || "（店名なし）", reasons }); return; }

    const restaurant: Restaurant = {
      id: `gm_${placeId}`,
      placeId,
      name,
      genre: text(sourceList) || "未分類",
      sourceCategories: text(row.Categories).split(",").map((value) => value.trim()).filter(Boolean),
      address,
      latitude,
      longitude,
      rating,
      reviewCount: Number(row["Review Count"]) || 0,
      image,
      registeredBy,
      googleMapsUrl,
      phone: text(row.Phone) || undefined,
      price: text(row.Price) || undefined,
      sourceList: text(sourceList) || "未分類",
      importedAt,
    };
    const key = duplicateKey(restaurant);
    if (knownKeys.has(key)) { duplicateCount += 1; return; }
    knownKeys.add(key);
    valid.push(restaurant);
  });

  return { total: rows.length, valid, duplicateCount, errors, missingHeaders: [] };
}

export function mergeGourmetMapRestaurants(existing: Restaurant[], incoming: Restaurant[]) {
  const keys = new Set(existing.map(duplicateKey));
  return [...existing, ...incoming.filter((restaurant) => {
    const key = duplicateKey(restaurant);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })];
}
