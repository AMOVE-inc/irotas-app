import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "/Users/kondokanon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs";

const root = process.cwd();
const assetDir = path.join(root, "public", "discord-gourmet-contests");
const dataPath = path.join(root, "constants", "imported-gourmet-contests.ts");
const videoPattern = /\.(mov|mp4|m4v|webm)$/i;
let data = await readFile(dataPath, "utf8");
const files = await readdir(assetDir);

for (const [index, file] of files.entries()) {
  if (videoPattern.test(file)) continue;
  const source = path.join(assetDir, file);
  const optimized = file.replace(/\.[^.]+$/, ".jpg");
  const destination = path.join(assetDir, optimized);
  const temporary = `${destination}.tmp`;
  await sharp(source).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(temporary);
  if (source !== destination) await unlink(source);
  await writeFile(destination, await readFile(temporary));
  await unlink(temporary);
  if (file !== optimized) data = data.replaceAll(`/discord-gourmet-contests/${file}`, `/discord-gourmet-contests/${optimized}`);
  if ((index + 1) % 40 === 0) process.stdout.write(`Optimized ${index + 1}/${files.length}\n`);
}

await writeFile(dataPath, data);
console.log(`Optimized ${files.filter((file) => !videoPattern.test(file)).length} images.`);
