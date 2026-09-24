#!/usr/bin/env bash

set -euo pipefail

readonly INTERNAL_GROUP="IRO+ 内部テスト"
readonly WHAT_TO_TEST="ログイン、ホーム、イベント一覧・詳細・申込み、掲示板の投稿・コメント・返信、チャット、通知、プロフィールなど主要機能をご確認ください。Web版とのデータ同期や画面表示もご確認いただき、不具合があればスクリーンショットと操作手順をお知らせください。"

pnpm dlx eas-cli submit \
  --platform ios \
  --latest \
  --profile production \
  --groups "$INTERNAL_GROUP" \
  --what-to-test "$WHAT_TO_TEST" \
  --auto-testflight-setup \
  --wait \
  --non-interactive

status_json="$(pnpm dlx eas-cli submit:status --platform ios --json)"
printf '%s\n' "$status_json" | node scripts/verify-testflight-status.mjs

cat <<'EOF'
Internal TestFlight distribution is verified.
If external testers are required, add the external group in App Store Connect,
submit the build for Beta App Review, and verify externalState is IN_BETA_TESTING.
EOF
