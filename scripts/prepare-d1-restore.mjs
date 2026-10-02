import fs from "node:fs";
import crypto from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((item, index, all) => item.startsWith("--") ? [item.slice(2), all[index + 1]] : null).filter(Boolean));
if (!args.input || !args.output || args.confirm !== "ISOLATED_RESTORE") {
  throw new Error("usage: node scripts/prepare-d1-restore.mjs --input backup.json --output restore.sql --target irotas-staging-restore --confirm ISOLATED_RESTORE");
}
if (!args.target || !/(staging|restore|sandbox)/i.test(args.target) || /(prod|production)/i.test(args.target)) {
  throw new Error("target must explicitly identify an isolated staging/restore/sandbox database and must not contain prod");
}
const bytes = fs.readFileSync(args.input);
const backup = JSON.parse(bytes.toString("utf8"));
if (backup.format !== "irotas-d1-backup-v1" || !backup.tables || typeof backup.tables !== "object") throw new Error("unsupported backup format");
const identifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const literal = (value) => value === null ? "NULL" : typeof value === "number" ? (Number.isFinite(value) ? String(value) : "NULL") : typeof value === "boolean" ? (value ? "1" : "0") : `'${String(value).replaceAll("'", "''")}'`;
const lines = [
  `-- target: ${args.target}`,
  `-- source: ${args.input}`,
  `-- sha256: ${crypto.createHash("sha256").update(bytes).digest("hex")}`,
  "PRAGMA foreign_keys=OFF;",
  "BEGIN TRANSACTION;",
];
for (const [table, rows] of Object.entries(backup.tables)) {
  if (!/^[A-Za-z0-9_]+$/.test(table) || !Array.isArray(rows)) throw new Error(`invalid table: ${table}`);
  lines.push(`DELETE FROM ${identifier(table)};`);
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.length) continue;
    lines.push(`INSERT INTO ${identifier(table)} (${columns.map(identifier).join(", ")}) VALUES (${columns.map((column) => literal(row[column])).join(", ")});`);
  }
}
lines.push("COMMIT;", "PRAGMA foreign_keys=ON;", "PRAGMA foreign_key_check;");
fs.writeFileSync(args.output, `${lines.join("\n")}\n`, { flag: "wx" });
console.log(JSON.stringify({ output: args.output, target: args.target, schemaVersion: backup.schemaVersion, tableCount: Object.keys(backup.tables).length }, null, 2));
