# IRO+ Webサービス 機能・品質テストマトリクス

更新日: 2026-10-01

## 1. この文書の目的

IRO+ の機能を単位ごとに分け、現在存在するテストと、リリース品質を保証するために不足しているテストを明確にする。

ここでいう「テスト完了」は、テストファイルが存在することや既存テストが成功することだけを意味しない。機能ごとに、単体、コンポーネント結合、API 契約、実 DB 結合、外部システム結合、E2E の必要な層を通過して初めて完了とする。

## 2. 現在のテスト実行結果

2026-10-02（JST）に `pnpm quality:evidence` で全ローカル品質ゲートを再実行した結果:

- lint: 終了コード 0（既存warning 34件、error 0件）
- 型検査: 成功
- Vitest: 186 files / 864 tests 成功、失敗・スキップ 0
- React Nativeコンポーネント結合: 4 suites / 10 tests 成功
- SQLite結合: 2 files / 16 tests 成功
- カバレッジ: statements 73.16%、branches 65.06%、functions 59.14%、lines 73.16%
- Web E2E: desktop Chromium / Pixel 7相当で合計10件成功
- production build: 成功
- 証跡: `artifacts/quality/2026-10-02T03-45-48-533Z-quality-evidence.md`（UTC表記）
- HTML: `coverage/index.html`、`artifacts/playwright-report/index.html`

テストファイルの概略分類:

| 種類 | 該当ファイル数の概算 | 備考 |
| --- | ---: | --- |
| 純粋ロジック単体テスト | 84 | `lib/` の関数を中心に検証 |
| ソース構造・文字列確認 | 52 | 実画面を動かさず、実装文字列の存在を確認 |
| API ハンドラテスト | 25 | `Request` を生成してハンドラを直接呼び出す |
| 疑似 D1 を使うテスト | 21 | 実際の D1 SQL エンジンではない |
| 外部通信をモックするテスト | 22 | Square、Google、通知、メールなどの実接続ではない |
| React Nativeコンポーネント結合 | 4 suites / 10 cases | ログイン、支部選択、管理画面権限、会員検索・フォローを実描画・操作 |
| 実ブラウザ E2E | 1 suite / 10 cases | Playwrightでdesktop/mobile viewportを実行 |
| 実端末 E2E | 0 | iOS Simulator、Android emulator、Maestroは利用不可 |

同じテストファイルが複数分類に該当するため、合計は182にならない。

## 3. 必要なテスト層

| 層 | 検証対象 | 主な障害の切り分け |
| --- | --- | --- |
| L1 単体 | 関数、変換、権限判定、バリデーション | ロジックの誤り |
| L2 UIコンポーネント結合 | コンポーネント、Hook、Store、Router、入力操作 | 状態管理、イベント、画面遷移 |
| L3 クライアント・API契約 | APIクライアントとAPI Schema、認証、エラー形式 | 型ずれ、Cookie/Bearer差、URL誤り |
| L4 API・実DB結合 | Worker/APIとテスト用D1、Migration、トランザクション | SQL、Migration、制約、同時実行 |
| L5 外部システム結合 | Square Sandbox、Google Maps、Resend、APNs/FCM、Expo | 資格情報、Webhook、外部仕様差 |
| L6 E2E | ブラウザ・iPhone・Androidから一連の操作 | 配線全体、端末固有、戻る操作、ディープリンク |
| L7 本番スモーク | 読み取り中心の本番確認 | デプロイ漏れ、環境変数、実サービス状態 |

E2E は最終確認であり、L2からL5を省略する代替手段ではない。E2E が失敗したときに L2からL5のどこが失敗したかを下位テストで切り分ける。

## 4. 機能一覧と現在のテスト状況

記号:

- `○`: その層に有効なテストが存在し、現在成功
- `△`: 一部のみ、またはモック・ソース文字列確認に限定
- `×`: 有効なテストを確認できない
- 完了判定は、対象機能に必要な層が揃っているかで判定する

| 機能 | 概要 | 主な既存テスト | L1 | L2 | L3 | L4 | L5 | L6 | 現在の完了判定 |
| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| 認証・初回登録 | セットアップコード、ログイン、セッション、支部選択、初回プロフィール | `sites-auth`, `setup-code-delivery`, `setup-registration-discovery`, `auth.logout`, `login.component`, `select-branch.component`, `web-smoke` | ○ | △ | △ | △ | △ | △ | 未完了。ログイン必須入力・成功・失敗再試行・二重送信防止、支部選択L2、Webプレビュー認証は成功。実メール・実D1・Native認証結合が必要 |
| 会員状態・権限 | 有効、休会、退会、会員ランク、運営、管理者、部長のアクセス制御 | `access-control`, `membership-access`, `member-status`, `member-staff-role`, `role-migration`, `campaign-manager-permissions.component`, `sites-campaign-permissions`, `sqlite-migration-integration` | ○ | △ | △ | △ | × | × | 未完了。一般会員拒否／運営・管理者許可のL2・L3、会員状態の実SQLite往復は成功。全管理画面と実D1が必要 |
| プロフィール・会員一覧 | プロフィール編集、年齢公開、SNS、フォロー、会員検索、バッジ | `member-directory`, `profile-social-links`, `member-age`, `member-follows`, `profile-accessibility`, `member-directory.component`, `sqlite-migration-integration`, `web-smoke` | ○ | △ | △ | △ | × | △ | 未完了。検索・フォローL2、公開ID・フォロー制約L4、Web検索E2Eは成功。プロフィール編集L2とWeb/Native同期が必要 |
| ホーム・タイムライン | お知らせ、イベント、投稿、活動情報の統合表示と遷移 | `home-timeline`, `home-activity`, `home-event-card`, `instant-community-render`, `web-smoke` | △ | △ | △ | × | × | △ | 未完了。ホーム到達とタブ表示はWeb E2E成功。実データ統合、表示順、Native遷移が必要 |
| 掲示板 | カテゴリ、スレ、コメント、編集、削除、リアクション、未読、長押し操作 | `sites-board-content`, `shared-board-content`, `board-navigation`, `board-thread-edits`, `board-unread`, `sqlite-migration-integration`, `submission-lock`, `web-smoke` | ○ | △ | △ | △ | × | △ | 未完了。API、実SQLite制約・削除連鎖、投稿連打ロック、Webタブ遷移は成功。投稿UI操作・Native E2Eが必要 |
| 掲示板投票 | 投票作成、投票、編集、結果、投票者表示 | `board-polls`, `board-poll-server`, `poll-voter-and-edit` | ○ | △ | △ | △ | × | × | 未完了。UI操作と同時投票・重複投票の実DB検証が必要 |
| 自己紹介 | 自己紹介チャット、Discord移行、リアクション、スタートミッション判定 | `club-introduction`, `introduction-reactions`, `member-start-missions`, `board-navigation` | △ | △ | △ | △ | × | × | 未完了。投稿からミッション完了までの結合テストが必要 |
| チャット | 一覧、DM、グループ、部活、運営、メッセージ、添付、返信 | `sites-chat-content`, `chat-access`, `chat-list-preview`, `chat-profile`, `sqlite-migration-integration`, `submission-lock`, `web-smoke` | ○ | △ | △ | △ | × | △ | 未完了。API再送冪等性、実SQLite制約・削除連鎖、送信連打ロック、Webタブ遷移は成功。入室・再表示・複数端末同期・Native E2Eが必要 |
| チャット付加機能 | リアクション、メンション、未読、投票、入力欄拡張 | `chat-reactions`, `mentions`, `chat-unread-sync`, `chat-poll-vote`, `expanding-message-input` | ○ | △ | △ | △ | × | × | 未完了。React Native UI操作とリアルタイム同期が必要 |
| 部活動 | 部活一覧、入部申請、承認、部長管理、部活掲示板、部員限定アクセス | `sites-clubs`, `sites-club-application-flow`, `club-viewer-access`, `club-event-access`, `board-navigation` | ○ | △ | △ | △ | × | × | 未完了。入部から掲示板・チャット入室までの一連テストが必要 |
| イベント基本 | 一覧、検索、作成、編集、詳細、画像、参加申込、参加確定者 | `sites-events`, `event-form`, `event-participation`, `event-participants`, `event-confirmed-participants`, `sqlite-migration-integration`, `web-smoke` | ○ | △ | △ | △ | × | △ | 未完了。Web一覧遷移・連打とDB制約は成功。画像保存・申込画面・Native E2Eが必要 |
| イベント運用 | 募集終了・再開、キャンセル、出欠、開催完了、参加者チャット、XP | `event-recruitment-channel`, `event-cancellation`, `sites-imported-event-lifecycle`, `event-automation-server`, `sqlite-migration-integration` | ○ | △ | △ | △ | × | × | 未完了。募集から終了までの主要状態を実SQLiteで往復し、関連API・ロジックも成功。画面操作、同時更新、旧アプリ実機互換が必要 |
| Discord移行イベント | Discord受付データ、幹事、参加者、アプリ募集への切替 | `event-import-merge`, `sites-imported-event-lifecycle`, `sites-imported-event-organizer` | ○ | △ | △ | △ | × | × | 未完了。移行データを使うシナリオ結合テストが必要 |
| イベント決済 | Square事前・事後決済、Checkout、Webhook、参加確定 | `event-checkout`, `square-client`, `square-webhook`, `square-sync` | ○ | × | △ | △ | △ | × | 未完了。Square SandboxでCheckout→Webhook→D1更新が必要 |
| イベントコメント・通知 | コメント、返信、リアクション、同期、通知 | `sites-event-comment-flow`, `event-comments-sync`, `event-presentation-and-comments` | ○ | △ | △ | △ | △ | × | 未完了。複数ユーザーとPushを含む結合が必要 |
| 通知 | アプリ内通知、既読、設定、Push Token、ディープリンク | `sites-notifications`, `in-app-notifications`, `push-notifications` | ○ | △ | △ | △ | △ | × | 未完了。APNs/FCMの実端末受信と通知遷移が必要 |
| ごちそうさま報告 | 店舗、評価、写真、投稿、コメント、リマインド | `meal-report`, `gourmet-report-reminder`, `restaurant-location` | ○ | △ | △ | △ | △ | × | 未完了。Google店舗特定、画像、投稿再集計の結合が必要 |
| グルメマップ | Google保存リスト、店舗一覧、写真、候補、承認、コメント、重複統合 | `gourmet-map-feed`, `gourmet-map-community`, `gourmet-map-candidates`, `google-maps-api`, `google-maps-cost-controls` | ○ | △ | △ | △ | △ | × | 未完了。Google Places実APIの契約・制限・キャッシュ検証が必要 |
| グルメコンシェルジュ | 店舗検索とGoogle Places候補の整形 | `concierge-restaurants`, `restaurant-location`, `ai-recommendation` | ○ | △ | △ | △ | △ | × | 未完了。外部応答変化、0件、制限超過を検証する必要あり |
| XP・ランク・ポイント | 投稿、コメント、チャット、イベント、幹事、重複防止、ランク判定 | `xp-policy`, `shared-xp`, `xp-store`, `rank-up-points`, `benefits-persistence` | ○ | △ | △ | △ | × | × | 未完了。同時投稿・日次上限・再試行を実DBで確認する必要あり |
| スタートミッション | 達成判定、初回10XP、完了済み表示、テスト会員初期化 | `member-start-missions`, `start-mission-visibility` | ○ | △ | △ | △ | × | × | 未完了。各機能の実達成からポップアップまでの結合が必要 |
| 会員特典 | クーポン、プレゼント、キャンペーン、ポイント利用 | `coupon-rules`, `benefits-persistence`, `gift-campaign-*`, `shared-campaign-migration` | ○ | △ | △ | △ | × | × | 未完了。期限、同時利用、管理画面との結合が必要 |
| リンクプレビュー | 食べログ、Google Maps等の外部リンクカード、内部リンク除外 | `sites-link-preview`, `content-link-cards`, `internal-links`, `external-link-navigation` | ○ | △ | △ | × | △ | × | 未完了。実サイトHTML変化、画像取得、タイムアウト検証が必要 |
| 画像・動画・ファイル | 投稿・イベント画像、認証済み画像、Imported Media、Range配信 | `imported-media`, `sites-video-range`, `event-image-source`, `media-layout-and-loading` | ○ | △ | △ | △ | △ | × | 未完了。実R2、権限、アップロード中断、大容量ファイルが必要 |
| 休会・退会 | 申請、アンケート、Square停止、管理者処理、アクセス停止 | `account-deletion`, `account-deletion-admin`, `account-deletion-survey`, `membership-access` | ○ | △ | △ | △ | △ | × | 未完了。Square Sandboxと退会後アクセス遮断の結合が必要 |
| 管理画面 | 分析、CSV、運営権限、会員管理、移行、督促、監視 | `sites-analytics`, `admin-analytics-csv`, `operator-management`, `billing-overdue`, `system-monitoring` | ○ | △ | △ | △ | △ | × | 未完了。権限分離、実データ量、CSV、監査ログ確認が必要 |
| バックアップ・復旧 | バックアップ準備、マニフェスト、復旧手順 | `backup-readiness`, `backup-restore-drill` | △ | × | △ | △ | × | × | 未完了。隔離環境への実リストア演習が必要 |

## 5. 機能単位の単体テスト完了条件

各機能の L1 を「完了」にするには、少なくとも次を満たす。

1. 正常系だけでなく、境界値、空値、不正値、権限差、日付境界を検証する。
2. 分岐と重要ロジックのカバレッジを計測する。
3. UIソースに文字列が存在するだけのテストを単体テスト完了の根拠にしない。
4. 時刻、乱数、ネットワークに依存する処理は注入可能にする。
5. 重複防止、上限、状態遷移は表形式のケースで網羅する。
6. バグ修正には、修正前に失敗する再現テストを追加する。

カバレッジ計測は導入済みだが、全体のfunctionsは59.14%で、特に画面・Hook・コンポーネントには未実行箇所が多い。このため、864件が成功していても「全機能の単体テスト完了」とは判定しない。純粋ロジック部分は広くテストされているが、画面、Hook、Store、APIクライアントとの境界は一部に留まる。

## 5.1 今回完了した未実施テストと、外部要因で残るもの

今回完了:

- 全Migrationを実SQLiteへ適用し、主要テーブル、状態CHECK、一意制約、外部キーを検証
- 会員・部長・運営・管理者の権限とチャット境界をデータ駆動で検証
- logoutテストのスキップを解除し成功
- React Native Testing Libraryを導入し、支部選択画面の必須入力と操作有効化を実描画で検証
- ログイン画面の必須入力、成功後のユーザー保存とデータ更新、失敗表示・再試行、クリックとEnterの同時操作による二重送信防止をL2で検証
- 一般会員・運営・管理者の管理画面表示をL2で、401・403・成功応答をL3で検証
- active・grace期限内外・suspendedを実SQLiteへ保存し、アクセス判定までL4で検証
- 会員検索と楽観的フォローをL2、公開IDの大文字小文字一意性とフォロー重複・自己フォロー拒否をL4、検索画面をWeb L6で検証
- 注目／新規セクションで同一会員の行キーが衝突する不具合を検出し、一意化
- 掲示板・チャットの状態CHECK、重複リアクション／参加拒否、コメント・メッセージ削除連鎖を実SQLiteで検証
- 掲示板投稿・チャット送信へ同期送信ロックを共通適用し、連続呼び出し拒否と完了後の再試行を検証
- チャットAPIで同一`clientMessageId`を再送してもメッセージが1件だけになることを検証
- イベント募集開始、申込、確定、募集終了、キャンセル申請、取消、開催終了の主要状態を実SQLiteで往復検証
- Webのプレビューログイン、再読込後のセッション保持、主要5タブ遷移、全5タブ各5回連打をdesktop/mobile viewportで検証
- PR/push用GitHub Actions品質ゲートを追加

現在の環境だけでは実施不能:

- Square、Google Places、Resend、R2、APNs/FCMのSandbox資格情報を使うL5外部結合
- 独立したWebステージング環境でのE2Eとデプロイ昇格確認
- iPhone実機/SimulatorおよびAndroid実機/emulatorのE2E、Push受信、ディープリンク、端末間同期
- 隔離したCloudflare D1/R2への実バックアップ復元演習

したがって「ローカルで実行可能だった未実施テスト」は完了したが、リリース判定全体は未完了である。上記は環境・資格情報・テスト端末の準備後に実施する。

## 6. 結合テストの実装方針

### L2 UIコンポーネント結合

React Native Testing Libraryを導入し、Router、Store、APIクライアントをテストダブルにして次を操作する。

- 一覧項目をタップすると正しいIDで遷移する
- 戻ると正しい一覧へ戻る
- 読み込み、空、エラー、再試行を表示する
- 入力欄、投票、長押しメニューが操作できる

### L3 クライアント・API契約

ZodまたはOpenAPIを正本にし、クライアントとAPIハンドラが同じSchemaを使う。Web CookieとNative Bearerの両方を検証する。

### L4 API・実DB結合

テストごとに空のD1へ全Migrationを適用し、HTTP経由でAPIを呼ぶ。疑似PreparedStatementではなく、実SQL、外部キー、一意制約、トランザクション、同時実行を検証する。

### L5 外部システム結合

- Square Sandbox: Checkout、Webhook署名、冪等性、返金・失敗
- Google Maps/Places: 実テストキー、API制限、写真、0件、Quota超過
- Resend: テスト宛先または検証用Webhook、送信失敗、再送
- APNs/FCM/Expo Push: テスト端末、無効Token、通知タップ
- R2: アップロード、認証、Range、削除、期限切れURL

本番キーをCIへ配布せず、Sandbox専用Secretを使う。外部結合テストはPRごとの高速テストと、夜間・リリース前テストに分ける。

### L6 E2E

- Web: Playwright
- iPhone/Android: Maestro

E2Eは主要利用経路に絞り、すべての分岐をE2Eで検証しない。失敗時はL2からL5の対応テストで原因を局所化する。

## 7. 推奨する実装順序

1. API Schemaと共通エラー形式を定義する。
2. テスト用D1へMigrationを適用するハーネスを作る。
3. 掲示板、チャット、イベントのL3/L4結合テストを作る。
4. React Native Testing Libraryで重要な遷移のL2テストを作る。
5. Square、Google Maps、Push、Resend、R2のL5テストを作る。
6. PlaywrightとMaestroで主要シナリオのL6テストを作る。
7. GitHub ActionsでL1からL4をPR必須、L5を夜間・リリース前、L6をリリース前必須にする。

最優先対象は、過去に繰り返し不具合が出た掲示板、チャット、部活、イベント状態遷移、認証である。
