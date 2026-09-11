-- 運営アナウンスの過去ログは、2026年8月分だけ公開履歴から削除する。
-- UTC保存のため、日本時間での8月（2026-08-01 00:00 ～ 09-01 00:00）を明示する。
UPDATE chat_messages
SET deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE room_id = 'board-announcement'
  AND deleted_at IS NULL
  AND datetime(created_at) >= datetime('2026-07-31T15:00:00.000Z')
  AND datetime(created_at) < datetime('2026-08-31T15:00:00.000Z');
