import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const REQUIRED_D1_TABLES = [
  "members",
  "member_subscriptions",
  "events",
  "event_participations",
  "clubs",
  "club_memberships",
  "board_threads",
  "board_comments",
  "chat_rooms",
  "chat_messages",
  "in_app_notifications",
  "audit_logs",
  "migration_runs",
];

const SENSITIVE_KEY = /(email|discord.*id|square.*id|token|secret|password|card|cvv|name|address)/i;

function sensitivePaths(value, path = "root") {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPath = `${path}.${key}`;
    return [
      ...(SENSITIVE_KEY.test(key) ? [nextPath] : []),
      ...sensitivePaths(child, nextPath),
    ];
  });
}

export function verifyBackupManifest(manifest) {
  const errors = [];
  if (manifest?.version !== 1) errors.push("version must be 1");
  if (manifest?.sourceEnvironment !== "production") errors.push("sourceEnvironment must be production");
  if (!Number.isInteger(manifest?.schemaVersion) || manifest.schemaVersion < 21)
    errors.push("schemaVersion must be 21 or newer");
  if (!manifest?.createdAt || Number.isNaN(Date.parse(manifest.createdAt)))
    errors.push("createdAt must be an ISO date");

  const tables = manifest?.d1?.tableCounts;
  if (!tables || typeof tables !== "object") {
    errors.push("d1.tableCounts is required");
  } else {
    for (const table of REQUIRED_D1_TABLES) {
      if (!Number.isInteger(tables[table]) || tables[table] < 0)
        errors.push(`missing or invalid table count: ${table}`);
    }
    if ((tables.members ?? 0) < 1) errors.push("members must not be empty");
  }

  for (const [label, value] of [
    ["r2.objectCount", manifest?.r2?.objectCount],
    ["r2.totalBytes", manifest?.r2?.totalBytes],
  ]) {
    if (!Number.isInteger(value) || value < 0) errors.push(`${label} must be a non-negative integer`);
  }

  const leakedPaths = sensitivePaths(manifest);
  if (leakedPaths.length) errors.push(`sensitive fields are forbidden: ${leakedPaths.join(", ")}`);
  return { valid: errors.length === 0, errors };
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: pnpm backup:verify <redacted-manifest.json>");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const result = verifyBackupManifest(manifest);
  if (!result.valid) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Backup manifest verification passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
