# IRO+ 本番基盤

## 採用構成

- フロントエンド/API: Sites Worker
- 構造化データ: D1 (`DB`)
- 投稿画像・プロフィール画像・イベント画像: R2 (`UPLOADS`)
- 外部連携: Square、メール配信、Google Maps / Places

500名規模の初期運用では、公開サイトとAPI・DB・画像保存を同じ基盤にまとめ、別サーバーの日常運用を発生させない。ブラウザの端末保存は表示設定や入力途中の下書きだけに限定し、会員・投稿・イベント・チャット・ポイント等の正本はD1へ移す。

## 環境分離

- 本番: Sitesの公開URL。実会員とSquare本番環境を接続する。
- 開発: ローカル。モックデータまたは開発用データのみを扱う。
- 本番データのCSVをローカルへコピーしない。

## 保存方針

- D1: 会員、権限、投稿、コメント、イベント、申込み、チャット、ポイント、通知、監査ログ、画像メタデータ。
- R2: 画像本体と移行アーカイブ。D1には所有者、種類、容量、保存キーを記録する。
- 端末保存: テーマ、閉じた案内、未送信下書きなど、消えても業務データを失わないものだけ。

## バックアップ・復旧

- 会員移行前、Discord本移行前、Square本番切替前に復旧点を作る。
- CSV移行は実行ID、元ファイル名、件数、エラー件数を `migration_runs` に残す。
- 管理操作は `audit_logs` に記録し、誰が何を変更したか追跡可能にする。
- 画像はランダムな保存キーを使い、元ファイル名を公開URLに含めない。

## 公開前の基盤合格条件

1. 公開WorkerからD1とR2へ接続できる。
2. 秘密情報がクライアントへ埋め込まれていない。
3. 本番ではプレビューログインを無効化する。
4. 認証済みAPIだけが会員データを更新できる。
5. DB更新と画像保存の失敗時に、不整合を検出・回復できる。
6. 移行結果の件数照合と監査ログを確認できる。

## 運用手順

- [運用・障害報告・問い合わせ対応手順](./operations/incident-support-runbook.md)
- [既存会員への登録・移行案内](./operations/existing-member-migration-guide.md)
- [APIキー・Secrets ローテーション手順](./operations/secret-rotation-runbook.md)
- [個人情報・決済・権限 最終レビュー](./operations/final-security-review.md)
- [バックアップ復元訓練](./operations/backup-restore-drill.md)
- [本番最終移行・更新凍結](./operations/final-migration-freeze.md)
- [Go / NoGo 判定資料](./operations/go-nogo-decision-packet.md)
