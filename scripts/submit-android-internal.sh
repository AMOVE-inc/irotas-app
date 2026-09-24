#!/usr/bin/env bash

set -euo pipefail

pnpm dlx eas-cli submit \
  --platform android \
  --latest \
  --profile production \
  --wait \
  --non-interactive

status_json="$(pnpm dlx eas-cli submit:list --platform android --limit 1 --json --non-interactive)"
printf '%s\n' "$status_json" | node scripts/verify-android-internal-status.mjs
