#!/usr/bin/env bash

set -euo pipefail

readonly INTERNAL_GROUP="IRO+ 内部テスト"

pnpm dlx eas-cli submit \
  --platform ios \
  --latest \
  --profile production \
  --groups "$INTERNAL_GROUP" \
  --auto-testflight-setup \
  --wait \
  --non-interactive

status_json="$(pnpm dlx eas-cli submit:status --platform ios --json)"
printf '%s\n' "$status_json" | node scripts/verify-testflight-status.mjs

cat <<'EOF'
Internal TestFlight distribution is verified.
Next, add "IRO+ 外部テスト" in App Store Connect, submit for Beta App Review,
then run `pnpm verify:ios:testflight` to verify both groups are testing.
EOF
