// Generated maintenance script: fetches Discord attachment originals from URLs
// refreshed by an authenticated export and saves them as app-owned assets.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , manifestPath, outputDir] = process.argv;
if (!manifestPath || !outputDir) throw new Error("manifest path and output directory are required");
const { default: manifest } = await import(`file://${path.resolve(manifestPath)}`, { with: { type: "json" } });
await mkdir(outputDir, { recursive: true });
for (const item of manifest) {
  const response = await fetch(item.url);
  if (!response.ok) throw new Error(`${item.name}: HTTP ${response.status}`);
  await writeFile(path.join(outputDir, item.name), Buffer.from(await response.arrayBuffer()));
}
