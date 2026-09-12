-- Let comment notifications open the exact board thread or chat room.
ALTER TABLE in_app_notifications ADD COLUMN target_path TEXT;
