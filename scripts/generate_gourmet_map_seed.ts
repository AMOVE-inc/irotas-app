import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCsv } from "../lib/migration-csv";

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error("CSV path is required");

  const csv = await readFile(resolve(sourcePath), "utf8");
  const rows = parseCsv(csv);
  const importedAt = "2026-08-01T00:00:00+09:00";
  const records = rows.flatMap((row) => {
  const latitude = Number(row.Latitude);
  const longitude = Number(row.Longitude);
  const rating = Number(row["Average Rating"]);
  if (!row.Name || !row.Fulladdress || !row["Place Id"] || !row["Google Maps URL"] || !row["Featured Image"] || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(rating) || rating <= 0) return [];
  return [{
    id: `gm_${row["Place Id"]}`,
    placeId: row["Place Id"],
    name: row.Name,
    genre: "居酒屋",
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
    sourceList: "居酒屋",
    importedAt,
  }];
  });

  const output = `// Generated from the owner-provided 202608 居酒屋 list.\n` +
    `// Re-run scripts/generate_gourmet_map_seed.ts to refresh this preview seed.\n` +
    `export const GOURMET_MAP_SEED = ${JSON.stringify(records, null, 2)} as const;\n`;
  await writeFile(resolve("constants/gourmet-map-seed.ts"), output, "utf8");
  console.log(`Generated ${records.length} restaurants`);
}

void main();
