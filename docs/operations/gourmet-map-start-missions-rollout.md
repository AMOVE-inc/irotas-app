# グルメマップ候補・スタートミッション公開手順

## 対象機能

- 星4以上のごちそうさま報告を候補キューへ登録
- Google Place IDによる店舗照合とカテゴリ推定
- 運営承認後のグルメマップ公開
- メンバーコメントの表示とGoogle保存リスト用コピー
- 初回ログインガイド6項目
- 各ミッションの初回達成10XP付与

## 公開前の設定

本番Sites環境に次を設定する。

- `GOURMET_MAP_FEED_URL`: 更新済みGoogle Apps ScriptのWebアプリURL
- `GOOGLE_MAPS_API_KEY`: Places APIを有効化したサーバー用キー
- `GOOGLE_MAPS_SEARCH_MONTHLY_LIMIT=1000`: Text Searchの月間上限
- `GOOGLE_MAPS_PHOTOS_ENABLED=true`: 店舗写真を表示する場合
- `GOOGLE_MAPS_PHOTO_MONTHLY_LIMIT=5000`: 写真取得の月間上限
- `GOURMET_MAP_AUTO_PUBLISH_MIN_REPORTERS`: 初期運用では未設定にして運営承認を必須にする

Google Apps Scriptは `scripts/google-drive-gourmet-map-sync.gs` の最新版を既存デプロイへ反映する。既存のWebアプリURLを維持し、GETでフィードJSON、POSTで更新処理が成功することを確認する。

## 反映順

1. 本番DBのバックアップを取得する。
2. `drizzle/0065_gourmet_map_candidates.sql` を適用する。
3. `drizzle/0066_member_start_missions.sql` を適用する。
4. Google Apps Scriptを更新する。
5. Web/APIを公開する。
6. Webで動作確認する。
7. 同一ソースからiOSとAndroidをビルドする。
8. TestFlight内部・外部テスト、Google Play内部テストへ配布する。
9. iPhoneとAndroid実機で同一会員のデータ同期を確認する。

API公開をDBマイグレーションより先に行わない。掲示板投稿APIが候補テーブルへ書き込むため、テーブル未作成の状態ではごちそうさま報告の保存に影響する。

## Web/API確認

### グルメマップ

1. 星4以上、Google Maps URLありのごちそうさま報告を作成する。
2. `gourmet_map_candidates` に `pending` で1件作成されることを確認する。
3. 運営アカウントの「承認待ち」から承認する。
4. Place ID、カテゴリ、コメント、写真が店舗詳細へ反映されることを確認する。
5. 「感想をコピーして保存リストを開く」で、推定カテゴリの共有リストが開くことを確認する。
6. 投稿の評価を4未満へ変更すると候補が `ineligible` になることを確認する。
7. 投稿削除後に公開対象が再集計されることを確認する。

Google Mapsの公開APIでは保存リストやメモを編集できないため、メモはコピー後にGoogle Maps側で貼り付ける。

### スタートミッション

1. 初回表示のガイドを開始し、再ログイン後も既読状態が維持されることを確認する。
2. 6項目を1つずつ達成し、各項目の初回だけ10XP増えることを確認する。
3. 同じ画面を再読込してもXPが増えないことを確認する。
4. 別端末で同じ会員へログインし、進捗とXPが一致することを確認する。
5. 達成時にXPポップアップが表示されることを確認する。

## 旧アプリ互換

- 新しいAPIとテーブルは追加型で、既存の画面ルートを変更しない。
- 旧アプリが `/api/gourmet-map/community` へPOSTした場合は、直接公開せず `202 queued` を返す。
- 候補作成は掲示板APIを正として処理するため、旧アプリからの投稿も承認キューへ入る。
- 初回ガイドは新しいクライアントだけが表示する。旧アプリのログイン・掲示板・イベント操作には影響しない。

## ロールバック

- Web/APIは直前のビルドへ戻す。
- Google Apps Scriptは直前のデプロイへ戻す。
- `0065/0066`のテーブルは旧コードから参照されないため、緊急時も削除せず残す。
- 自動公開を止める場合は `GOURMET_MAP_AUTO_PUBLISH_MIN_REPORTERS` を未設定に戻す。
- Google Places呼び出しを止める場合は `GOOGLE_MAPS_PHOTOS_ENABLED=false` とし、必要に応じてAPIキーを無効化する。

## 自動検証

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
git diff --check
```
