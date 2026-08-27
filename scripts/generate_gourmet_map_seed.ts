import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseCsv } from "../lib/migration-csv";

async function main() {
  const sourcePaths = process.argv.slice(2);
  if (!sourcePaths.length) throw new Error("One or more CSV paths are required");
  const importedAt = "2026-08-01T00:00:00+09:00";
  const records = [] as Record<string, unknown>[];
  const knownPlaceIds = new Set<string>();
  for (const sourcePath of sourcePaths) {
    const sourceList = basename(sourcePath).replace(/\.csv$/i, "").replace(/^\d{6,8}[_-]?/, "").trim() || "未分類";
    const csv = await readFile(resolve(sourcePath), "utf8");
    const rows = parseCsv(csv);
    for (const row of rows) {
  const latitude = Number(row.Latitude);
  const longitude = Number(row.Longitude);
  const rating = Number(row["Average Rating"]);
  if (!row.Name || !row.Fulladdress || !row["Place Id"] || !row["Google Maps URL"] || !row["Featured Image"] || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(rating) || rating <= 0 || knownPlaceIds.has(row["Place Id"])) continue;
  knownPlaceIds.add(row["Place Id"]);
  records.push({
    id: `gm_${row["Place Id"]}`,
    placeId: row["Place Id"],
    name: row.Name,
    genre: sourceList,
    sourceCategories: row.Categories.split(",").map((value) => value.trim()).filter(Boolean),
    address: row.Fulladdress,
    latitude,
    longitude,
    rating,
    reviewCount: Number(row["Review Count"]) || 0,
    image: row["Featured Image"],
    googleMapsUrl: row["Google Maps URL"],
    phone: row.Phone || undefined,
    price: row.Price || undefined,
    sourceList,
    importedAt,
  });
    }
  }

  const output = `// Generated from the owner-provided 202608 gourmet map lists.\n` +
    `// Re-run scripts/generate_gourmet_map_seed.ts to refresh this preview seed.\n` +
    `export const GOURMET_MAP_SEED = ${JSON.stringify(records, null, 2)} as const;\n`;
  await writeFile(resolve("constants/gourmet-map-seed.ts"), output, "utf8");
  console.log(`Generated ${records.length} restaurants`);
}

void main();
