# Google Maps API 費用管理

## アプリ側の方針

- グルメマップ一覧では、会員投稿などIRO+が管理する画像だけを表示する。
- Google Placesの店舗写真は、会員が店舗詳細を開いた時に1枚だけ取得する。
- Google店舗写真、写真URI、写真名は保存・共有キャッシュしない。Place IDだけを保持する。
- `/api/gourmet-map/photo` はログイン済み会員だけが利用できる。
- 緊急時は本番環境変数 `GOOGLE_MAPS_PHOTOS_ENABLED=false` を設定して写真取得を停止する。
- D1で月間取得数を原子的に記録し、`GOOGLE_MAPS_PHOTO_MONTHLY_LIMIT` 到達後はGoogleへ写真を要求しない。初期値は5,000回/月。
- グルメコンシェルジュはIRO+の店舗フィードを先に検索し、見つからない場合だけPlaces Text Searchを使う。検索は `GOOGLE_MAPS_SEARCH_MONTHLY_LIMIT` で月1,000回までに制限する。
- リンクプレビューは対象ページのOG画像だけを使用し、Places検索による画像補完は行わない。

## Google Cloudで設定するもの

1. Places API (New) のAPIキーを本番Workerだけに登録する。
2. APIキーのAPI制限を Places API (New) のみにする。
3. Places API (New) の分単位の割り当て上限を低く設定し、短時間の大量アクセスを防ぐ。
4. Cloud Billingで月1万円、3万円、5万円の予算通知を作る。
5. 毎月、請求レポートをSKU別に確認し、`Places API Place Details Photos` の件数を記録する。

予算通知は課金を自動停止しない。Google写真についてはアプリ側の月間上限で止め、緊急時は `GOOGLE_MAPS_PHOTOS_ENABLED=false` を使用する。上限5,000回の場合、写真SKUは無料枠1,000回を除く4,000回が課金対象となり、現行単価では最大約28米ドル/月となる。
