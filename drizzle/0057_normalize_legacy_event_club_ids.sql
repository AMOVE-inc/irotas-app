-- Discord event archives used three historical club IDs after the app clubs
-- had already moved to their current IDs. Normalize persisted events so club
-- members are authorized against the same membership records.
UPDATE events
SET club_id = CASE club_id
      WHEN 'club-stage' THEN 'club-theater'
      WHEN 'club-sports-viewing' THEN 'club-sports-watch'
      WHEN 'club-cooking' THEN 'club-cooking-class'
      ELSE club_id
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE club_id IN ('club-stage', 'club-sports-viewing', 'club-cooking');

INSERT OR IGNORE INTO migration_runs
  (id, migration_type, source_filename, status, imported_count, skipped_count,
   error_count, summary_json, started_at, completed_at)
VALUES
  ('normalize-legacy-event-club-ids-20260919', 'event_club_id_normalization',
   'product-request', 'completed', changes(), 0, 0,
   '{"aliases":{"club-stage":"club-theater","club-sports-viewing":"club-sports-watch","club-cooking":"club-cooking-class"}}',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

PRAGMA optimize;
