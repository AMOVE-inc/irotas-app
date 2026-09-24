#!/usr/bin/env bash

set -euo pipefail

readonly INTERNAL_GROUP="IRO+ 内部テスト"

build_json="$(pnpm dlx eas-cli build:list --platform ios --limit 1 --json --non-interactive)"
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
  --platform ios \
  --latest \
  --profile production \
  --groups "$INTERNAL_GROUP" \
  --auto-testflight-setup \
  --wait \
  --non-interactive

for attempt in $(seq 1 40); do
  status_json="$(pnpm dlx eas-cli submit:status --platform ios --json)"
  if printf '%s\n' "$status_json" | node scripts/verify-testflight-status.mjs --build-number "$build_number"; then
    break
  fi
  if [[ "$attempt" -eq 40 ]]; then
    echo "TestFlight build $build_number did not become available for internal testing in time." >&2
    exit 1
  fi
  sleep 30
done

cat <<'EOF'
Internal TestFlight distribution is verified.
Next, add "IRO+ 外部テスト" in App Store Connect, submit for Beta App Review,
then run `pnpm verify:ios:testflight` to verify both groups are testing.
EOF
