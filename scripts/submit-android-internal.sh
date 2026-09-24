#!/usr/bin/env bash

set -euo pipefail

build_json="$(pnpm dlx eas-cli build:list --platform android --limit 1 --json --non-interactive)"
build_number="$(printf '%s\n' "$build_json" | node -e '
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const build = JSON.parse(input)[0];
  if (!build || build.status !== "FINISHED" || !build.appBuildVersion) process.exit(1);
  process.stdout.write(String(build.appBuildVersion));
});
')"

pnpm dlx eas-cli submit \
  --platform android \
  --latest \
  --profile production \
  --wait \
  --non-interactive

status_json="$(pnpm dlx eas-cli submit:list --platform android --limit 10 --json --non-interactive)"
printf '%s\n' "$status_json" | node scripts/verify-android-internal-status.mjs --build-number "$build_number"
