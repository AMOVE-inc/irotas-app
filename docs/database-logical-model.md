# IRO+ データベース論理モデル

更新日: 2026-10-02

この図は`drizzle/0000`から`0069`までのMigrationを、業務ドメイン単位に整理した論理モデルである。SQLite/D1の全カラムを列挙する物理モデルではなく、主要エンティティと関係を示す。

各`status`、決済状態、募集状態の値と遷移は、[状態遷移・イベントライフサイクル・権限・多重操作監査](state-transitions-event-lifecycle-permissions.md)に分離している。

## 1. 会員・認証・部活動

```mermaid
erDiagram
    MEMBERS ||--o{ MEMBER_SESSIONS : has
    MEMBERS ||--o{ MEMBER_SUBSCRIPTIONS : linked_to
    MEMBERS ||--|| MEMBER_ID_ASSIGNMENTS : receives
    MEMBERS ||--o{ MEMBER_PRIVATE_NOTES : owns
    MEMBERS ||--o{ MEMBER_PRIVATE_NOTES : target
    MEMBERS ||--o{ MEMBER_FOLLOWS : follows
    MEMBERS ||--o{ MEMBER_FOLLOWS : followed_by
    MEMBERS ||--o{ CLUB_MEMBERSHIPS : joins
    MEMBERS ||--o{ CLUBS : leads
    CLUBS ||--o{ CLUB_MEMBERSHIPS : has
    MEMBERS ||--o{ ACCOUNT_DELETION_REQUESTS : requests
    MEMBERS ||--o| WITHDRAWN_MEMBER_SNAPSHOTS : retained_as
    MEMBERS ||--o{ MEMBER_STATUS_HISTORY : changes
    MEMBERS ||--|| MEMBER_START_MISSION_STATE : owns
    MEMBERS ||--o{ MEMBER_START_MISSION_REWARDS : earns
    MEMBERS ||--o{ MEMBER_PUSH_TOKENS : registers

    MEMBERS {
      int id PK
      string email UK
      string public_member_id
      string user_handle UK
      string display_name
      string account_status
      string member_rank
      int xp
      string access_role
      json profile_json
    }
    MEMBER_SUBSCRIPTIONS {
      int id PK
      int member_id FK
      string square_customer_id
      string square_subscription_id
      string access_status
      string paid_until_date
    }
    MEMBER_SESSIONS {
      string token_hash PK
      int member_id FK
      string expires_at
    }
    CLUBS {
      string id PK
      string name
      int leader_member_id FK
      string status
    }
    CLUB_MEMBERSHIPS {
      string club_id PK, FK
      int member_id PK, FK
      string status
      int decided_by_member_id FK
    }
    ACCOUNT_DELETION_REQUESTS {
      string id PK
      int member_id FK
      string request_type
      string status
      string scheduled_for
    }
    WITHDRAWN_MEMBER_SNAPSHOTS {
      int member_id PK, FK
      string email
      string display_name
      json profile_json
      string retained_at
    }
    MEMBER_STATUS_HISTORY {
      int id PK
      int member_id FK
      string status_type
      string previous_status
      string new_status
      string changed_at
    }
    MEMBER_START_MISSION_STATE {
      int member_id PK, FK
      string guide_seen_at
    }
    MEMBER_START_MISSION_REWARDS {
      int member_id PK, FK
      string mission_key PK
      string grant_id
      string status
    }
    MEMBER_PUSH_TOKENS {
      string token PK
      int member_id FK
      string platform
      json preferences_json
    }
```

退会完了時は`members`を削除しない。表示用の`members`は「退会済みユーザー」へ匿名化する前に、元の会員情報をAPI非公開の`withdrawn_member_snapshots`へ保存する。投稿・イベント等の外部キーを維持し、フォロー・個人メモも保持する。認証セッションと未使用認証コードだけはアクセス遮断のため失効させる。`members.account_status`と`member_subscriptions.access_status`の変更は、DBトリガーで`member_status_history`へ変更前・変更後・変更日時を保存する。

## 2. 掲示板・チャット

```mermaid
erDiagram
    MEMBERS ||--o{ BOARD_THREADS : authors
    BOARD_THREADS ||--o{ BOARD_COMMENTS : contains
    MEMBERS ||--o{ BOARD_COMMENTS : authors
    MEMBERS ||--o{ BOARD_REACTIONS : reacts
    BOARD_THREADS ||--o| BOARD_HELPFUL_ANSWERS : selects
    BOARD_COMMENTS ||--o| BOARD_HELPFUL_ANSWERS : selected_comment
    MEMBERS ||--o{ BOARD_POLL_VOTES : votes

    MEMBERS ||--o{ CHAT_ROOMS : creates
    CHAT_ROOMS ||--o{ CHAT_ROOM_MEMBERS : has
    MEMBERS ||--o{ CHAT_ROOM_MEMBERS : participates
    CHAT_ROOMS ||--o{ CHAT_MESSAGES : contains
    MEMBERS ||--o{ CHAT_MESSAGES : sends
    CHAT_MESSAGES ||--o{ CHAT_MESSAGE_REACTIONS : receives
    MEMBERS ||--o{ CHAT_MESSAGE_REACTIONS : reacts
    CHAT_ROOMS ||--o{ CHAT_ROOM_READS : read_state
    MEMBERS ||--o{ CHAT_ROOM_READS : reads

    BOARD_THREADS {
      string id PK
      int author_member_id FK
      string category
      string title
      string status
      json data_json
    }
    BOARD_COMMENTS {
      string id PK
      string thread_id FK
      int author_member_id FK
      string content
      string deleted_at
    }
    BOARD_REACTIONS {
      string target_type PK
      string target_id PK
      int member_id PK, FK
      string emoji PK
    }
    BOARD_POLL_VOTES {
      string owner_type PK
      string owner_id PK
      string option_id PK
      int member_id PK, FK
    }
    CHAT_ROOMS {
      string id PK
      string type
      string source_id
      int created_by_member_id FK
    }
    CHAT_ROOM_MEMBERS {
      string room_id PK, FK
      int member_id PK, FK
      string role
    }
    CHAT_MESSAGES {
      string id PK
      string room_id FK
      int sender_member_id FK
      string content
      string image_url
      json image_urls_json
      json reply_to_json
      string deleted_at
    }
    CHAT_MESSAGE_REACTIONS {
      string message_id PK, FK
      int member_id PK, FK
      string emoji PK
    }
    CHAT_ROOM_READS {
      string room_id PK, FK
      int member_id PK, FK
      string last_read_at
    }
```

## 3. イベント・申込・決済

```mermaid
erDiagram
    MEMBERS ||--o{ EVENTS : organizes
    EVENTS ||--o{ EVENT_PARTICIPATIONS : receives
    MEMBERS ||--o{ EVENT_PARTICIPATIONS : applies
    EVENTS ||--o{ EVENT_FAVORITES : receives
    MEMBERS ||--o{ EVENT_FAVORITES : marks
    EVENTS ||--o{ EVENT_CANCELLATION_REQUESTS : has
    MEMBERS ||--o{ EVENT_CANCELLATION_REQUESTS : requests
    EVENTS ||--o{ EVENT_COMMENTS : has
    MEMBERS ||--o{ EVENT_COMMENTS : authors
    EVENT_COMMENTS ||--o{ EVENT_COMMENT_REACTIONS : receives
    MEMBERS ||--o{ EVENT_COMMENT_REACTIONS : reacts
    EVENTS ||--o{ EVENT_PAYMENT_CHECKOUTS : has
    MEMBERS ||--o{ EVENT_PAYMENT_CHECKOUTS : pays
    EVENTS ||--o{ EVENT_ATTENDANCE_CONFIRMATIONS : records
    MEMBERS ||--o{ EVENT_ATTENDANCE_CONFIRMATIONS : attends
    EVENTS ||--|| EVENT_ATTENDANCE_FINALIZATIONS : finalizes
    EVENTS ||--o{ EVENT_XP_REWARDS : grants
    MEMBERS ||--o{ EVENT_XP_REWARDS : earns
    EVENTS ||--o{ EVENT_FEEDBACK_RESPONSES : receives
    MEMBERS ||--o{ EVENT_FEEDBACK_RESPONSES : submits
    EVENTS ||--o| EVENT_IMPORT_SOURCES : imported_from
    EVENTS ||--o{ EVENT_IMPORT_FIELD_EDITS : protects
    EVENTS ||--o{ EVENT_IMPORT_CONFLICTS : conflicts
    EVENTS ||--o{ EVENT_POINT_USAGES : discounts
    MEMBERS ||--o{ EVENT_POINT_USAGES : uses

    EVENTS {
      string id PK
      int organizer_member_id FK
      string title
      string event_date
      string status
      string event_type
      int capacity
      json public_data_json
    }
    EVENT_PARTICIPATIONS {
      string event_id PK, FK
      int member_id PK, FK
      string status
      string payment_state
    }
    EVENT_CANCELLATION_REQUESTS {
      string id PK
      string event_id FK
      int member_id FK
      string status
      int reviewed_by_member_id FK
    }
    EVENT_COMMENTS {
      string id PK
      string event_id FK
      int author_member_id FK
      string content
      string deleted_at
    }
    EVENT_PAYMENT_CHECKOUTS {
      string id PK
      string event_id FK
      int member_id FK
      int amount_yen
      int points_used
      string status
      string square_order_id UK
      string square_payment_id UK
    }
    EVENT_ATTENDANCE_CONFIRMATIONS {
      string event_id PK, FK
      int member_id PK, FK
      string status
      int confirmed_by_member_id FK
    }
    EVENT_XP_REWARDS {
      string id PK
      int member_id FK
      string event_id FK
      string action
      int amount
      string status
    }
    EVENT_FEEDBACK_RESPONSES {
      string id PK
      string event_id FK
      int member_id FK
      int overall_rating
      string comment
    }
    EVENT_IMPORT_SOURCES {
      string event_id PK, FK
      string source_thread_id UK
      json source_data_json
    }
```

## 4. XP・ポイント・特典

```mermaid
erDiagram
    MEMBERS ||--o{ XP_OPERATION_REQUESTS : earns
    MEMBERS ||--|| IROTAS_POINT_BALANCES : owns
    MEMBERS ||--o{ IROTAS_POINT_TRANSACTIONS : has
    MEMBERS ||--o{ IROTAS_POINT_OPERATION_REQUESTS : requests
    COUPONS ||--o{ COUPON_USAGES : used_as
    MEMBERS ||--o{ COUPON_USAGES : uses
    GIFT_CAMPAIGNS ||--o{ GIFT_APPLICATIONS : receives
    MEMBERS ||--o{ GIFT_APPLICATIONS : applies
    MEMBERS ||--o{ BOARD_XP_REWARDS : earns
    BOARD_THREADS ||--o{ BOARD_XP_REWARDS : source_thread
    BOARD_COMMENTS ||--o{ BOARD_XP_REWARDS : source_comment

    XP_OPERATION_REQUESTS {
      string idempotency_key PK
      int member_id FK
      string action
      string source_id
      int amount
      string status
    }
    IROTAS_POINT_BALANCES {
      int member_id PK, FK
      int balance
    }
    IROTAS_POINT_TRANSACTIONS {
      string id PK
      int member_id FK
      int actor_member_id FK
      int amount
      string reason
    }
    COUPONS {
      string id PK
      string title
      string status
      string expires_at
    }
    COUPON_USAGES {
      string coupon_id PK, FK
      int member_id PK, FK
      string status
    }
    GIFT_CAMPAIGNS {
      string id PK
      string title
      string status
    }
    GIFT_APPLICATIONS {
      string id PK
      string campaign_id FK
      int member_id FK
      string status
    }
```

## 5. 通知・グルメマップ・運用

```mermaid
erDiagram
    MEMBERS ||--o{ IN_APP_NOTIFICATIONS : receives
    CLUBS ||--o{ IN_APP_NOTIFICATIONS : source_club
    EVENTS ||--o{ IN_APP_NOTIFICATIONS : source_event
    IN_APP_NOTIFICATIONS ||--o{ PUSH_NOTIFICATION_DELIVERIES : dispatches
    MEMBER_PUSH_TOKENS ||--o{ PUSH_NOTIFICATION_DELIVERIES : target
    MEMBERS ||--o{ GOURMET_MAP_CANDIDATES : reviews
    MEMBERS ||--o{ BACKUP_SNAPSHOTS : creates
    MEMBERS ||--o{ CAMPAIGNS : creates

    IN_APP_NOTIFICATIONS {
      string id PK
      int target_member_id FK
      string type
      string club_id FK
      string event_id FK
      string chat_room_id FK
      string read_at
    }
    PUSH_NOTIFICATION_DELIVERIES {
      string notification_id PK, FK
      string token PK, FK
      string status
      string error_code
    }
    GOURMET_MAP_CANDIDATES {
      string id PK
      string source_thread_id UK
      string restaurant_name
      float member_rating
      string place_id
      string status
      int reviewed_by_member_id FK
    }
    STORED_FILES {
      string id PK
      string owner_user_id
      string object_key UK
      string content_type
      int byte_size
      string status
    }
    BACKUP_SNAPSHOTS {
      string id PK
      string object_key UK
      int schema_version
      int byte_size
      string sha256
      int created_by_member_id FK
    }
    AUDIT_LOGS {
      int id PK
      string actor_user_id
      string action
      string entity_type
      string entity_id
    }
    MIGRATION_RUNS {
      string id PK
      string migration_type
      string status
      int imported_count
      int skipped_count
      int error_count
    }
    APPLICATION_ERRORS {
      int id PK
      string request_id UK
      string method
      string path
      string error_name
      string error_message
    }
```

## 6. 補足

- `profile_json`、`public_data_json`、`data_json`など、一部の業務属性はJSONへ格納されている。
- 投票は掲示板とチャットのowner type / owner IDを使う多相関連があり、すべてが外部キーとして表現されているわけではない。
- `audit_logs.actor_user_id`、`stored_files.owner_user_id`などは文字列参照で、`members.id`へのDB外部キーではない。
- Discord移行・照合用テーブル、請求督促、審査状態、Google Maps API使用量などの補助テーブルは図を簡潔にするため一部省略している。
- 物理モデルを確定する場合は、全Migration適用後のD1から`sqlite_schema`と`PRAGMA foreign_key_list`を抽出し、自動生成した図と照合する。
