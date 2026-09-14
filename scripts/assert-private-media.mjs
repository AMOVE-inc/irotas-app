import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const mediaDirectories = ["discord-board", "discord-benefits", "discord-gourmet-contests"];
const misplaced = mediaDirectories.filter((directory) => existsSync(path.join(root, "public", directory)));
if (misplaced.length) {
  throw new Error(`Private media must not be placed in public/: ${misplaced.join(", ")}`);
}
