# iOS・Android 配布計画と審査チェックリスト

更新日: 2026-08-24

## ストアアカウントの現在地（2026-08-24）

| ストア | 現在地 | 次の操作 | 担当 |
| --- | --- | --- | --- |
| Apple Developer Program | 組織登録を申請済み。Appleの審査待ち | 承認メールを確認し、年会費を支払う | Non |
| Google Play Console | 組織アカウントと支払いプロファイルを作成済み。組織サイトの所有権も確認済み | Googleの本人確認完了メールを待ち、続けて電話番号を確認する | Non |
| Expo / EAS | ネイティブ配布用の設定とビルド定義を準備済み | IRO+所有のExpoプロジェクトへ連携後、内部テスト用ビルドを作成する | Codex + Non |

本人確認中は、Google Play Consoleの電話番号確認がロックされる。本人確認メール到着後にのみ電話番号の確認を行う。審査やストアに掲載する連絡先には、継続して受信できる組織メールアドレスを使用する。

## 決定した配布方式

- 現在のWeb/PWA版は、ネイティブ版の審査中も本番運用を継続する。
- iOSはEAS Buildで作成し、TestFlightの内部テストを経てApp Storeで一般公開する。
- AndroidはEAS Buildで作成し、Google Playの内部テストを経て本番公開する。
- アプリIDはiOS・Androidとも `com.irotas.community`、ディープリンクは `iroplus://` に固定する。
- ストア公開後はアプリIDを変更しない。
- `preview` は内部配布、`production` はストア提出用として `eas.json` で分離する。

### TestFlight提出の完了条件

- iOSの提出は `pnpm release:ios:testflight` を使用する。このコマンドは最新のproductionビルドを提出し、`IRO+ 内部テスト` グループへ割り当てる。
- EAS Submitの `Succeeded` だけでは完了扱いにしない。`eas submit:status --platform ios --json` で最新ビルドが `processingState=VALID` かつ `internalState=IN_BETA_TESTING` になったことを確認する。
- 修正後のテスト配布では毎回、App Store Connectで同じビルドを `IRO+ 外部テスト` にも追加し、必要に応じてBeta App Reviewへ提出する。`pnpm verify:ios:testflight` が `internalState=IN_BETA_TESTING` と `externalState=IN_BETA_TESTING` の両方を確認し、内部・外部TestFlightアプリで最新ビルドが表示されて初めて完了とする。
- ビルドが `READY_FOR_BETA_TESTING` のままの場合は処理済みでもグループ未割当であり、テスターには表示されない。

### Android内部テストの完了条件

- Androidは `pnpm release:android:internal` で最新のproductionビルドをGoogle Playの内部テストへ提出する。
- `pnpm verify:android:internal` が最新提出について `status=FINISHED`、`track=internal`、`releaseStatus=COMPLETED` を確認して初めて完了とする。

### 修正後の固定リリース順

1. Web本番を公開し、`pnpm smoke:production` を実行する。
2. iOSのproductionビルドを作成し、`pnpm release:ios:testflight` を実行する。
3. App Store Connectで同じビルドを `IRO+ 外部テスト` に追加する。
4. `pnpm verify:ios:testflight` で内部・外部の両方が `IN_BETA_TESTING` であることを確認する。
5. Androidのproductionビルドを作成し、`pnpm release:android:internal` を実行する。
6. `pnpm verify:android:internal` でGoogle Play内部テストへの反映を確認する。
7. TestFlightとAndroid実機で最新ビルド番号が表示されることを確認する。

## 開発者アカウント

| 項目                    | 方針                                                            | 担当        |
| ----------------------- | --------------------------------------------------------------- | ----------- |
| Apple Developer Program | IRO+の組織アカウントを使用                                      | Non         |
| App Store Connect       | 管理者はNon。運営メンバーへ決済情報・証明書管理権限を付与しない | Non         |
| Google Play Console     | IRO+の組織アカウントを使用                                      | Non         |
| EAS / Expo              | IRO+管理用アカウントでプロジェクトを作成                        | Non + Codex |
| ビルド・審査資料        | Codexが作成し、Nonが最終確認                                    | Codex / Non |

組織登録でD-U-N-S番号などの事業者確認が求められる場合は、ストア申請より先に完了させる。

## ストア審査前の必須条件

### 共通

- [x] 利用規約とプライバシーポリシーを公開し、アプリ設定画面から開ける。
- [x] 本番APIで認証・権限・個人情報のアクセス制御が動作する。
- [x] アプリ内からアカウント削除を申請・取り消しできる。
- [x] ログインなしで開けるWebのアカウント削除申請ページを公開する。
- [x] 管理者が申請を確認し、削除・匿名化を完了する管理処理を実装する。
- [ ] 一般メンバー用の審査アカウントを用意し、審査中も有効に保つ。
- [x] カメラ・写真・通知を使う理由と、収集するデータのストア申告案を実装と照合する。
- [ ] 本番バックエンド、画像、通知を審査期間中も稼働させる。

### Apple

- [ ] App Store Connectでアプリ名、Bundle ID、SKUを登録する。
- [x] プライバシー回答案を実装と照合し、追跡しない項目を誤って申告しない。
- [x] 審査メモ案に一般メンバーのログイン手順、部活動・イベント・削除の確認手順を記載する。
- [x] ストア掲載文、検索語、初回更新情報、スクリーンショット8画面の撮影計画を作成する。
- [ ] スクリーンショット、説明、サポートURL、プライバシーポリシーURLを登録する。
- [ ] TestFlightでログイン、支部選択、イベント、掲示板、チャット、部活動申請、ログアウトを実機確認する。

### Google Play

- [ ] 新規提出時点の要件に合わせ、Android 16 / API level 36以上をターゲットにしたAABであることをビルド成果物で確認する。
- [x] Data Safetyの記入案にメール、プロフィール、投稿、画像、利用履歴、診断、削除方法を整理する。
- [ ] App accessに一般メンバーの審査用ログイン手順を登録する。
- [ ] アプリ内削除導線と、Web削除申請URLをPlay Consoleへ登録する。
- [ ] 内部テストでインストール、更新、通知、戻る操作、画像選択、ログアウトを実機確認する。

## ストア掲載素材の確定チェックリスト

本人確認の完了を待つ間に、次を確定する。実在会員のメールアドレス、個人メモ、認証コード、削除前の個人情報は素材に含めない。

| 素材 | 用途 | 状態 | 担当 |
| --- | --- | --- | --- |
| アプリ名・短い説明・紹介文 | App Store / Google Play の掲載情報 | 文案作成済み。最終表記を確認 | Non |
| サポートURL・プライバシーポリシーURL・削除申請URL | 両ストアの必須掲載情報 | URL確定済み | Codex |
| アプリの正方形アイコン | ストア掲載・端末アイコン | アセット設定済み。ストア表示を最終確認 | Codex + Non |
| スクリーンショット | ストア掲載 | 8画面の撮影計画を作成済み。一般会員用の安全なテストデータで撮影 | Non |
| 審査用アカウント | App Review / App access | 管理画面で設定し、Square本番決済から分離する | Non |
| 審査メモ | ログイン方法・確認手順 | 文案作成済み。認証情報は提出画面だけに入力 | Codex + Non |

### 内部テストを始める前の一括確認

1. 審査アカウントでログインし、支部選択、イベント申込、掲示板投稿、チャット閲覧、部活動申請、ログアウトを1回ずつ確認する。
2. 管理者アカウントで、一般会員に管理画面・運営投稿権限・決済情報が見えないことを確認する。
3. アカウント削除申請から管理者の匿名化完了までを確認し、旧認証情報で再ログインできないことを確認する。
4. 上記をまとめて実施し、個別の外部テスターへの依頼はこの一括確認後に必要分だけ送る。

## 現在のブロッカー

| 優先度   | 項目                     | 完了条件                                                               |
| -------- | ------------------------ | ---------------------------------------------------------------------- |
| 完了 | アカウント削除の完了処理 | 本番DBの申請を管理者が確認し、削除・匿名化の完了と監査ログを記録できる   |
| Critical | ストア組織アカウント     | Apple・Googleの契約、事業者確認、支払先、税務情報をNonが完了する       |
| High     | EASプロジェクト連携      | IRO+所有のExpoプロジェクトIDを設定し、previewビルドが成功する          |
| High     | Android API 36確認       | production AABのtargetSdkVersionを成果物から確認する                   |
| High     | 審査アカウント           | Square課金に依存せず審査期間だけ利用可能な最小権限アカウントを発行する |
| Medium   | ストア素材               | アイコン、説明、スクリーンショット、問い合わせ先を確定する             |

## 実施順

1. NonがApple・Google・Expoの組織アカウントを確定する。
2. Nonがテスト用会員で削除申請から管理者の匿名化完了までを実機確認する。
3. CodexがEASプロジェクトを連携し、iOS preview / Android previewを作成する。
4. Nonの端末と一般メンバー用端末で、まとめた受入テストを実施する。
5. Codexがストア記入案、審査メモ、Data Safety下書きを作成する。
6. Nonが法務・表示・申告内容を最終承認し、Codexがproductionビルドを作成する。
7. TestFlight / Google Play内部テストの合格後、段階公開する。

## Go / No-Go

Criticalが1件でも未完了、または実機でログイン・削除・ログアウトが再現できない場合は提出しない。提出後に重大障害が見つかった場合はWeb/PWA版を継続し、ネイティブ版の公開を停止する。
