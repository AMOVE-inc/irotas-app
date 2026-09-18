-- Restore imported event ownership after a member's verified Discord identity is linked.
UPDATE events
SET organizer_member_id = (
    SELECT m.id
    FROM members m
    WHERE m.discord_user_id = replace(json_extract(events.public_data_json, '$.organizerProfileId'), 'discord-', '')
      AND m.account_status = 'active'
    LIMIT 1
  ),
  public_data_json = json_remove(public_data_json, '$.materializedOrganizerFallback'),
  updated_at = datetime('now')
WHERE id LIKE 'discord-event-%'
  AND json_extract(public_data_json, '$.materializedOrganizerFallback') = 1
  AND EXISTS (
    SELECT 1
    FROM members m
    WHERE m.discord_user_id = replace(json_extract(events.public_data_json, '$.organizerProfileId'), 'discord-', '')
      AND m.account_status = 'active'
  );

INSERT OR IGNORE INTO migration_runs
  (id, migration_type, source_filename, status, imported_count, skipped_count,
   error_count, summary_json, started_at, completed_at)
VALUES
  ('reconcile-imported-event-organizers-20260919', 'event_organizer_reconciliation',
   'product-request', 'completed', changes(), 0, 0,
   '{"purpose":"restore imported event owners and club leader badges from verified Discord identities"}',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

PRAGMA optimize;
