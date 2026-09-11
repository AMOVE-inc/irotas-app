-- These two Kanto branch exchange meetings are IRO+ official events, not
-- member gourmet meetups. Keep the classification stable if the Discord
-- archive is imported again later.
UPDATE events
SET event_type = 'official',
    club_id = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  'discord-event-1547552751800553543', -- 10/28 関東支部交流会 in 神保町
  'discord-event-1546076620689768588'  -- 10/4 関東支部交流会 in 中目黒
);

INSERT INTO event_import_field_edits (event_id, field_name, edited_at, actor_member_id)
SELECT id, 'eventType', CURRENT_TIMESTAMP, NULL
FROM events
WHERE id IN (
  'discord-event-1547552751800553543',
  'discord-event-1546076620689768588'
)
ON CONFLICT(event_id, field_name) DO UPDATE SET
  edited_at = excluded.edited_at,
  actor_member_id = excluded.actor_member_id;
