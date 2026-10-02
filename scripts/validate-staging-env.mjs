import fs from "node:fs";

const configPath = process.argv[2] ?? "sites/wrangler.staging.json";
if (!fs.existsSync(configPath)) throw new Error(`${configPath} がありません。wrangler.staging.example.json をコピーしてください`);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const errors = [];
if (config.name === "irotas-app-preview" || !String(config.name ?? "").includes("staging")) errors.push("Worker名に staging が必要です");
if (config.vars?.APP_ENVIRONMENT !== "staging") errors.push("APP_ENVIRONMENT=staging が必要です");
if (config.vars?.SQUARE_ENVIRONMENT !== "sandbox") errors.push("SQUARE_ENVIRONMENT=sandbox が必要です");
if (config.vars?.EVENT_PAYMENTS_ENABLED !== "false") errors.push("初回確認までは EVENT_PAYMENTS_ENABLED=false にしてください");
const d1 = config.d1_databases?.find((item) => item.binding === "DB");
if (!d1 || /REPLACE|prod/i.test(`${d1.database_name ?? ""} ${d1.database_id ?? ""}`)) errors.push("独立したstaging D1の実値が必要です（prod/placeholder不可）");
const r2 = config.r2_buckets?.find((item) => item.binding === "UPLOADS");
if (!r2 || !String(r2.bucket_name ?? "").includes("staging")) errors.push("staging専用R2 bucketが必要です");
if (errors.length) {
  console.error(errors.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}
console.log(`staging設定OK: ${config.name} / D1=${d1.database_name} / R2=${r2.bucket_name}`);
