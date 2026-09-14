-- Existing shared introductions receive the same default cracker reaction as new posts.
INSERT OR IGNORE INTO chat_message_reactions (message_id, member_id, emoji, created_at)
SELECT id, sender_member_id, '🎉', created_at
FROM chat_messages
WHERE room_id = 'board-introduction' AND deleted_at IS NULL;
