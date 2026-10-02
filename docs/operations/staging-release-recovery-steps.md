# ステージング・リリース・復旧 実行手順

## 重要な境界

- staging は本番と別の Worker/Sites、D1、R2、Secrets、Square Sandbox を使用する。
- `eas preview` は接続先APIを分けて初めて staging になる。
- 復元は隔離DBで検証してから判断し、本番DBへ直接投入しない。

## 1. Cloudflare側（担当者が実施）

1. D1で `irotas-staging` を新規作成し、database IDを控える。
2. R2で `irotas-staging-uploads` を新規作成する。
3. `sites/wrangler.staging.example.json` を `sites/wrangler.staging.json` にコピーし、D1 IDだけ実値へ置換する。
4. `pnpm verify:staging-env` を実行し、OKを確認する。
5. staging D1に `drizzle/` のmigrationを番号順に適用する。
6. staging Worker/Sitesへ、`AUTH_SECRET`、メール、Google、Square Sandboxの各secretを本番とは別値で登録する。
7. 初回は `EVENT_PAYMENTS_ENABLED=false` のままデプロイする。
8. staging URLでログイン、権限、イベント、画像、メールを確認する。
9. Square Sandboxのテスト会員・テストカードだけで決済確認し、問題がなければstagingのみ決済を有効化する。

## 2. EAS Preview側（担当者が実施）

1. stagingのHTTPS URLを確定する。
2. EASのpreview環境に `EXPO_PUBLIC_API_BASE_URL=<staging URL>` を登録する。
3. `pnpm dlx eas-cli build --profile preview --platform ios` と `--platform android` を実行する。
4. 実端末へインストールし、Web→iPhone→Android→Webの順で同じデータ更新が見えることを確認する。
5. previewアプリが本番データを表示した場合は即中止し、API URLとD1 bindingを再確認する。

## 3. 本番リリース

1. stagingで品質ゲートを通し、本番バックアップを作成してSHA-256と件数を保存する。
2. Webをデプロイし、`pnpm smoke:production` で主要APIを確認する。
3. iOS/Androidを同一ソースからbuildし、内部配布する。
4. iOS内部→iOS外部、Android internalの順で配布状態と実機build番号を確認する。
5. 監視でエラー率、認証、決済Webhook、同期を確認する。

## 4. ロールバックとDB復元

1. 障害時は決済などの危険機能をfeature flagで停止する。
2. Webは直前の正常artifact/commitを再デプロイする。モバイルは `expo-updates` がないため、修正版build番号で再配布する。
3. DB復元が必要ならバックアップJSONをローカルへ安全に取得し、SHA-256を台帳と照合する。
4. `pnpm backup:prepare-restore -- --input <backup.json> --output <restore.sql> --target irotas-staging-restore --confirm ISOLATED_RESTORE` でSQLを作る。
5. 新規隔離D1へmigrationを適用後、restore SQLを投入する。
6. `PRAGMA foreign_key_check`、テーブル件数、認証・権限・イベント・退会者保持を確認する。
7. 復元した隔離DBを本番へ切り替える判断は、影響範囲と停止時間を承認した後に行う。
