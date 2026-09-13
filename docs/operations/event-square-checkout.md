# 公式イベントのSquare決済：実装と公開前確認

## 今回の実装範囲

- 有料の先着順公式イベントは申込を「決済待ち」として座席を確保し、Square決済完了後に参加確定する。抽選は当選後に決済待ちへ進む。0円の先着順は申込時、0円の抽選は当選時に確定する。
- 決済待ちの本人だけが、自分の公式イベント参加費の決済リンクを作成・再取得できる。旧来の確定済み参加記録も参照できる。
- サーバーがランク別料金と適用済みイロタスポイントから残額を再計算する。0円ならSquareへ送信しない。
- 同じ会員・イベントには1つのチェックアウトを保持し、再試行には同じSquare冪等キーを使う。
- Squareの決済完了Webhookは署名、注文ID、金額、JPY、完了状態を照合してから共有DBを「支払済」にする。金額不一致は監査ログへ記録し、イベント決済の失敗を月額会費の延滞に転用しない。
- 支払済の決済待ち申込だけを参加確定に更新し、参加者チャット追加と通知を冪等に行う。満席判定には決済待ちの予約席を含める。確定処理に失敗したWebhookは再送時に再試行する。
- 決済待ち申込の取消・イベント中止時はSquareの決済リンクを削除してから席を解放する。取消後の遅延決済は参加確定せず、要確認として監査ログへ残す。
- イベント詳細にはSquareへの導線と共有DBの支払い状態を表示する。戻りURLだけでは支払済にしない。
- 管理者ダッシュボードには共有DBのイベント決済を確認専用で表示する。従来の端末内台帳とは区別する。

Squareの[CreatePaymentLink](https://developer.squareup.com/reference/square/checkout-api)、[QuickPay](https://developer.squareup.com/reference/square/objects/QuickPay)、[DeletePaymentLink](https://developer.squareup.com/reference/square/checkout-api/delete-payment-link)、[payment.updated Webhook](https://developer.squareup.com/reference/square/payments-api/webhooks/payment.updated)を参照した。Square管理画面では、このWebhook URLに`payment.created`と`payment.updated`の通知を設定する。

## 本番適用順

1. `drizzle/0043_event_payment_checkouts.sql`と`drizzle/0044_event_payment_confirmation.sql`を順番に本番D1に適用し、テーブル・索引・決済状態列を確認する。
2. `SQUARE_ACCESS_TOKEN`、`SQUARE_LOCATION_ID`、既存のWebhook署名キー・通知URLが同じSquare本番アプリ／店舗を指すことを秘密値を表示せず確認する。
3. SquareのSandboxで、0円・通常額・ポイント割引・先着／抽選・満席・重複クリック・決済失敗・決済完了・Webhook再送・申込取消・リンク削除・取消後の遅延決済を確認する。
4. 一般会員と管理者で、決済リンクが自分の確定済み申込に限られ、カード番号や決済トークンがアプリDBやログに残らないことを確認する。
5. 管理者ダッシュボードの旧端末内支払い台帳から共有DBへの表示切替と既存支払いの突合を完了してから公開判定する。

## 残る判断・実装

- **座席確保期限**：決済待ちの席は申込取消・運営取消・イベント中止まで保持する。Squareリンクの安全な無効化を伴う自動期限切れ処理は未実装。公開前に保持期限と運営の滞留確認手順を決める。
- **既存確定者**：変更前に参加確定していた公式イベント申込は維持する。旧端末内台帳やアプリ外決済を確認せずに未払いへ一括変更しない。既存申込の扱いは個別に突合する。
- **既存支払いの移行**：従来の端末内`payment-store`はWebhookから更新できない。新規Square決済の共有DB表示は追加済みだが、既存記録の照合・台帳統合が残る。
- **返金・イベント中止**：未払いのリンク停止は実装済み。支払済の参加取消・イベント中止に対するSquare返金と台帳更新は別途必要。取消後の遅延決済は監査ログで要確認とする。

この3点の完了と実アカウント受入までは、イベントSquare決済の本番Go判定を行わない。
