ALTER TABLE `chat_messages` ADD `externalMessageId` varchar(32);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `externalChannelId` varchar(32);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `externalAuthorId` varchar(32);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `externalAuthorName` varchar(255);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachmentUrls` json;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `source` enum('app','discord') DEFAULT 'app' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_external_message_id_unique` ON `chat_messages` (`externalMessageId`);
--> statement-breakpoint
ALTER TABLE `migration_imports` MODIFY COLUMN `importType` enum('members','events','participations','organizers','role_mappings','announcements') NOT NULL;
