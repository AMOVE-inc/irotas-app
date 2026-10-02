import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const commands = [
  ["lint", ["pnpm", "lint"]],
  ["typecheck", ["pnpm", "check"]],
  ["unit-and-handler-tests", ["pnpm", "test"]],
  ["component-integration", ["pnpm", "test:component"]],
  ["sqlite-integration", ["pnpm", "test:integration:sqlite"]],
  ["coverage", ["pnpm", "test:coverage"]],
  ["web-e2e", ["pnpm", "test:e2e:web"]],
  ["production-build", ["pnpm", "build"]],
];

const startedAt = new Date();
const results = commands.map(([name, [command, ...args]]) => {
  const start = Date.now();
  const result = spawnSync(command, args, { encoding: "utf8", env: process.env, maxBuffer: 20 * 1024 * 1024 });
  return {
    name,
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    durationMs: Date.now() - start,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
});

const finishedAt = new Date();
const outputDirectory = resolve("artifacts/quality");
mkdirSync(outputDirectory, { recursive: true });
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const path = resolve(outputDirectory, `${stamp}-quality-evidence.md`);
const body = [
  "# IRO+ quality evidence",
  "",
  `- Started: ${startedAt.toISOString()}`,
  `- Finished: ${finishedAt.toISOString()}`,
  `- Overall: ${results.every((result) => result.status === 0) ? "PASS" : "FAIL"}`,
  "",
  "| Check | Command | Exit | Duration ms |",
  "| --- | --- | ---: | ---: |",
  ...results.map((result) => `| ${result.name} | \`${result.command}\` | ${result.status} | ${result.durationMs} |`),
  "",
  ...results.flatMap((result) => [
    `## ${result.name}`,
    "",
    "```text",
    result.output || "(no output)",
    "```",
    "",
  ]),
].join("\n");
writeFileSync(path, body);
console.log(path);
process.exit(results.every((result) => result.status === 0) ? 0 : 1);
