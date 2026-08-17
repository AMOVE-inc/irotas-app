ALTER TABLE `allowed_emails` MODIFY COLUMN `accessRole` enum('member','club_leader','operator','admin') NOT NULL DEFAULT 'member';
