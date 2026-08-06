ALTER TABLE `scheduled_event_actions` MODIFY COLUMN `action` enum('organizer_deadline','organizer_three_days','organizer_two_days','organizer_one_day','organizer_same_day','chat_seven_days','chat_two_days') NOT NULL;--> statement-breakpoint
UPDATE `scheduled_event_actions` SET `action` = 'organizer_same_day' WHERE `action` = 'organizer_deadline';--> statement-breakpoint
ALTER TABLE `scheduled_event_actions` MODIFY COLUMN `action` enum('organizer_three_days','organizer_two_days','organizer_one_day','organizer_same_day','chat_seven_days','chat_two_days') NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `prefecture` varchar(16);--> statement-breakpoint
ALTER TABLE `events` ADD `tokyoArea` varchar(64);--> statement-breakpoint
ALTER TABLE `events` ADD `tabelogUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `events` ADD `googleMapsUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `events` ADD `participantsFinalizedAt` timestamp;
