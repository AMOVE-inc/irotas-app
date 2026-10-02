# IRO+ リリース・デプロイ・ロールバック・バックアップ運用

更新日: 2026-10-02

関連資料:

- [DB論理モデル](../database-logical-model.md)
- [状態遷移・イベントライフサイクル・権限・多重操作監査](../state-transitions-event-lifecycle-permissions.md)
- [機能・品質テストマトリクス](../quality-test-matrix.md)

## 1. 現在の構成と判定

| 項目 | 現在の状態 | 判定 |
| --- | --- | --- |
| Web本番 | OpenAI Sites project `appgprj_6a5f693137e881919dbc957c3b4f9406` | 稼働構成あり |
| Webステージング | 独立したSites project、D1、R2、Secretsを確認できない | 未整備 |
| ローカル開発 | Expo Web + ローカルServer | あり |
| iOS/Android preview | EAS `preview` profile、`preview` channel | あり |
| preview用バックエンド | `preview` profileに別API URLの指定なし | 未整備 |
| iOS本番候補 | EAS production build → TestFlight | あり |
| Android本番候補 | EAS production build → Google Play internal | あり |
| GitHub CI/CD | `.github/workflows`を確認できない | 未整備 |
| Web版ロールバック | Sitesの保存済みversionまたはGit commitから再デプロイ | 手順固定が必要 |
| モバイルOTA | `expo-updates`を依存関係・設定で確認できない | 未導入 |
| D1手動バックアップ | 管理者APIでJSONをprivate R2へ保存 | あり |
| D1自動バックアップ | アプリの15分cronにバックアップ処理なし | 未実装 |
| D1復元プログラム | JSONバックアップからの復元処理なし | 未実装 |
| R2画像バックアップ | 件数と容量の集計だけ。画像本体の別コピーなし | 未実装 |

現在は「開発」と「本番」の2環境であり、Web/バックエンドを本番同等構成で確認できる独立ステージング環境はない。EAS previewビルドも、別バックエンドを指定しなければ本番APIへ接続する可能性があるため、テスト環境とはみなさない。

## 2. 目標環境

| リソース | Development | Staging | Production |
| --- | --- | --- | --- |
| Sites project | ローカル | 専用project | 現行project |
| D1 | ローカル/テスト | `irotas-staging` | 現行`DB` |
| R2 | ローカル/テスト | staging専用bucket | 現行`UPLOADS` |
| Square | Sandbox | Sandbox | Production |
| Google Maps | 開発用制限キー | staging制限キー | 本番制限キー |
| Resend | テスト宛先 | テストドメイン/宛先 | 本番送信 |
| Push | 開発端末 | 社内テスト端末 | 本番端末 |
| 会員データ | 合成データ | 匿名化/合成データ | 実会員データ |
| URL | localhost | staging専用URL | `https://app.irotas-community.com` |

禁止事項:

- stagingから本番D1または本番R2へ接続しない。
- stagingからSquare本番決済、実会員へのPush・メール送信を行わない。
- 本番データをそのままstagingへ複製しない。

## 3. 推奨リリースフロー

### 3.1 PR時

1. feature branchからPRを作る。
2. `pnpm lint`、`pnpm check`、`pnpm test`、`pnpm build`をCIで実行する。
3. API/DB変更がある場合は後方互換MigrationとL3/L4結合テストを必須にする。
4. Square、Google Maps、Push等を変更した場合はSandbox結合テストを実行する。
5. 別開発者がレビューする。

### 3.2 リリース候補作成

1. 承認済みPRを`main`へマージする。
2. リリースcommit SHAを固定する。
3. `release/YYYY-MM-DD.N`形式のGit tagを作る。
4. 同じcommitからWeb archiveとEAS preview buildを作る。
5. commit SHA、build番号、schema version、Sites version IDをリリース記録へ残す。

### 3.3 stagingへのデプロイ

1. staging専用Sites projectへ、固定したcommitから作成したarchiveをデプロイする。
2. staging D1へMigrationを適用する。
3. `/api/platform/health`でD1、R2、認証、外部設定、schema versionを確認する。
4. L1からL5の自動テストを実行する。
5. PlaywrightでWeb主要動線、MaestroでiPhone/Android previewの主要動線を実行する。
6. Square Sandbox、Google Places、Push、Resend、R2を確認する。
7. 管理者、運営、部長、一般会員のテストアカウントで受入確認する。

### 3.4 productionへの昇格

staging合格後、新しくビルドし直さず、同じcommitと可能な限り同じarchiveをproductionへ昇格する。

1. 変更内容と影響範囲を確認する。
2. production D1の現在bookmarkまたは復旧時刻を記録する。
3. 管理者APIで論理バックアップを作成し、SHA-256と主要件数を記録する。
4. 破壊的Migrationがないことを確認する。
5. Sitesへ保存したversionをproductionにデプロイする。
6. `pnpm smoke:production`を実行する。
7. 管理者1名、一般会員1名でログイン、イベント、掲示板、チャット、プロフィールを確認する。
8. 24時間、500エラー、認証、Square、投稿、チャット、Pushを重点監視する。

### 3.5 モバイル配布

1. production commitからiOS/Android production buildを作成する。
2. iOSはTestFlight内部・外部テストへ同じbuildを割り当てる。
3. AndroidはGoogle Play internalへ提出する。
4. 両方の実機でbuild番号と主要機能を確認する。
5. 合格後に段階公開する。

API/DB変更は、旧スマホbuildが稼働したままでも動く後方互換にする。リリース順は原則、後方互換API/DB → Web → TestFlight/Play internal → ストア段階公開とする。

## 4. DB Migration方針

Migrationはexpand/contractで実施する。

1. Expand: 新カラム・新テーブルを追加する。旧コードも動作可能にする。
2. Migrate: 新旧両方を読み書きし、既存データを移行する。
3. Switch: 全クライアントが新構造を使うことを確認する。
4. Contract: 旧カラム削除は複数リリース後に別Migrationで行う。

同一リリースでカラム削除・名称変更とアプリ切替を行わない。DB Migrationはアプリコードのロールバックだけでは元に戻らない。

## 5. 障害時の判断

| 障害 | 初動 |
| --- | --- |
| UI/JSのみ | 前Web versionへ戻す、または直前commitを再デプロイ |
| API不具合、DB変更なし | 前Worker versionへ戻す |
| APIとDB Schemaが関連 | 旧コードが新Schemaで動くか確認。安全ならコードだけ戻す |
| データ破損 | 書き込み停止、復旧点確定、D1復元または論理バックアップ復元 |
| Square/通知の重複 | 該当ジョブ停止、idempotency記録確認、外部状態と再照合 |
| R2画像削除 | 別bucketのバックアップから復元 |
| モバイルbuild不具合 | ストア公開停止。以前のコードからbuild番号を上げた修正版を提出 |

## 6. Webのロールバック

### DB変更がない場合

1. 障害発生時刻、request ID、影響範囲を記録する。
2. 新規デプロイを停止する。
3. 直前の正常なSites versionを再デプロイする。
4. 保存済みversionが使えない場合は、正常なGit tagをcheckoutして同じ手順でbuild/deployする。
5. `pnpm smoke:production`を実行する。
6. 主要機能を確認する。

### DB変更がある場合

1. 先に書き込みを停止する。
2. 旧コードが現在Schemaで動くか判断する。
3. 後方互換ならコードだけ戻す。
4. 非互換またはデータ破損ならDB復旧手順へ進む。
5. コードversionとDB schema versionを同じ復旧記録へ残す。

## 7. モバイルのロールバック

現状は`expo-updates`を確認できないため、`eas update:rollback`を使える前提にしない。

- TestFlight/Play internalで問題が出た場合: 該当buildの配布を止め、前の正常commitからbuild番号/versionCodeを増やして再buildする。
- 段階公開中の場合: 公開割合の拡大を停止する。
- 既にインストール済みの本番build: 前buildへ直接ダウングレードできないため、以前の正常コードを含む新しいbuildを緊急提出する。
- API側は壊れたbuildと旧buildの両方が動ける状態を維持する。

将来OTAを導入する場合は、staging channelで同じupdateを検証後にproductionへrepublishし、runtime versionと永続端末データの後方互換を管理する。

## 8. 現在のバックアップ実装

`POST /api/admin/backups`を管理者が実行すると、次を行う。

1. D1のアプリケーションテーブルを1000行ずつ読み出す。
2. Schema、schema version、テーブル件数、全行をJSON化する。
3. SHA-256を計算する。
4. 同じ`UPLOADS` R2の`private-backups/d1/`へ保存する。
5. `backup_snapshots`と`audit_logs`へ記録する。

制約:

- 自動定期実行ではない。
- 1テーブル200万行で停止する。
- JSON自体はアプリケーションレベルでは暗号化していない。R2の保存時暗号化に依存する。
- 本番画像・動画のR2オブジェクト本体はバックアップしない。
- 同じSites/R2障害や誤操作から隔離された別保管先ではない。
- JSONからD1へ復元する実行プログラムがない。
- 保持期限と削除方針がない。

`GET /api/admin/backup-readiness`は、主要13テーブルの件数、schema version、R2件数と容量を集計するだけであり、R2バックアップを作成しない。

## 9. 推奨バックアップ設計

### D1

- D1 Time Travelが利用可能か、Sites管理基盤と権限で確認する。
- 利用可能なら障害直前のbookmark/時刻から復元できる運用を第一手段にする。
- 30日を超える保持用に、毎日D1をSQLまたは復元可能な形式で別R2 bucketへexportする。
- 現行JSON方式を継続する場合は、復元スクリプトと復元結合テストを追加する。

推奨保持:

- 日次: 35日
- 週次: 12週
- 月次: 12か月
- 大規模Migration・一括削除・会員移行前: 手動復旧点

### R2

- production `UPLOADS`とは別のbackup bucketへ日次差分コピーする。
- `private-backups/`に保持ロックを設定する。
- 削除済みオブジェクトも保持期間中は復元可能にする。
- 月1回、隔離したstaging bucketへ実復元する。

### 復旧目標案

- RPO: 通常24時間以内。D1 Time Travel利用時は障害直前の分単位を目標。
- RTO: Critical障害は2時間以内に主要機能を復旧。

## 10. DB復元手順

### 第一選択: D1 Time Travelが利用可能な場合

1. 書き込みを停止する。
2. 障害発生直前の時刻/bookmarkを確認する。
3. 復元直前のbookmarkも記録する。
4. 隔離環境で可能な範囲の確認を行う。
5. D1を指定時刻へrestoreする。
6. schema version、主要テーブル件数、会員・イベント・掲示板・チャットを確認する。
7. Square WebhookとPushの未処理・重複を再照合する。
8. 問題があればrestore前bookmarkへ戻す。

### 第二選択: 論理バックアップ

1. 本番を直接上書きせず、新しい一時D1へ復元する。
2. 全Migrationとbackup schema versionの整合を確認する。
3. 必須テーブル、件数、SHA-256、代表データ、権限境界を確認する。
4. 一時R2へ画像を復元し、D1のobject keyと照合する。
5. 合格後にSites bindingを復元済みD1/R2へ切り替える。
6. 本番スモークと受入確認後に書き込みを再開する。
7. 旧環境は監査・再切替用に一定期間保持する。

現状は手順2以降を自動実行する復元ツールがないため、実装と月次復元訓練が必要である。

## 11. リリース完了条件

- stagingがproductionと分離されている。
- 同じcommit/artifactをstagingからproductionへ昇格している。
- L1からL5と主要E2Eが成功している。
- D1復旧点と論理バックアップが作成されている。
- Web本番スモークが成功している。
- TestFlight内部・外部、Google Play internalで同じbuildを確認している。
- commit SHA、Sites version、schema version、iOS build、Android versionCodeを記録している。
- ロールバック判断者と実行者が明確である。
