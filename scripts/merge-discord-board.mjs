import { readFile, writeFile } from "node:fs/promises";

const [baselinePath, deltaPath, outputPath] = process.argv.slice(2);

if (!baselinePath || !deltaPath || !outputPath) {
  throw new Error("Usage: node scripts/merge-discord-board.mjs BASELINE DELTA OUTPUT");
}

const [baseline, delta] = await Promise.all(
  [baselinePath, deltaPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);

const mergeById = (older, newer) => [...new Map([...older, ...newer].map((item) => [item.id, item])).values()];
const threads = mergeById(baseline.threads ?? [], delta.threads ?? []).sort(
  (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
);
const comments = mergeById(baseline.comments ?? [], delta.comments ?? []).sort(
  (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
);

await writeFile(
  outputPath,
  JSON.stringify({ exportedAt: delta.exportedAt, threads, comments }),
  "utf8",
);

console.log(`Merged ${threads.length} threads and ${comments.length} comments into ${outputPath}`);
