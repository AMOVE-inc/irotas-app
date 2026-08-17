# IRO+ セキュリティ運用方針

## 保存する情報を最小限にする

- カード番号、セキュリティコード、有効期限、銀行口座情報はアプリへ保存しない。
- Squareから保持するのは、顧客ID、サブスクリプションID、プランID、契約・請求状態、支払期限、決済時メールアドレスに限定する。
- パスワードは平文保存せず、ユーザーごとのランダムsaltを付けたPBKDF2-HMAC-SHA256でハッシュ化する。
- WebのセッショントークンはHttpOnly・Secure・SameSite Cookieにのみ保存する。実会員のメールアドレスやプロフィールはlocalStorageへ保存しない。

## CSV移行

- 3ファイル照合はブラウザ内だけで処理し、照合ボタンではサーバーへ送信しない。
- 選択ファイルは30分後、画面遷移、または「今すぐ破棄」でメモリから解放する。
- 原本CSV、確認用CSV、バックアップをGit、公開ストレージ、チャットへ保存しない。
- 本番取り込みは管理者の認証済みセッション、件数確認、ドライラン、監査ログを必須とする。

## 本番公開の必須条件

1. 公開ビルドのプレビューログインを無効にする。
2. Sitesの秘密情報として `AUTH_SECRET`、メール配信トークン、Square Webhook署名キーを登録する。ソースコードや `.env` をGitへコミットしない。
3. Square WebhookはHTTPSのみを使用し、通知URL・生本文・署名キーによるHMAC-SHA256検証とイベントIDの重複防止を有効にする。
4. 管理者・運営メンバーは個別アカウントを使用し、Square・Google・GitHub・OpenAI側で多要素認証を有効にする。共有パスワードは禁止する。
5. 本番移行前に、一般会員・部長・運営・管理者それぞれで権限テストを行う。
6. 定期バックアップ、復元テスト、退会者削除、監査ログ確認の担当者と周期を決める。

## インシデント対応

- 誤公開や漏えいの疑いがある場合は、ログインとCSV取り込みを停止し、セッション、認証用秘密情報、Square Webhook署名キーを失効・再発行する。
- 影響したデータ、期間、対象者、原因、対応履歴を監査記録へ残す。
- 個人情報保護法および契約先の要件に従い、必要な本人通知・関係機関への報告を判断する。

## 参考基準

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP HTTP Headers Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
- Square Webhook signature validation: https://developer.squareup.com/docs/webhooks/step3validate
- Cloudflare D1 data security: https://developers.cloudflare.com/d1/reference/data-security/
