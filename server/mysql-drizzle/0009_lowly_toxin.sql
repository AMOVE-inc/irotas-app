CREATE TABLE `app_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`eventId` int,
	`chatRoomId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roleKey` varchar(128) NOT NULL,
	`displayName` varchar(255) NOT NULL,
	`category` enum('operator','branch','generation','club','rank','other') NOT NULL,
	`metadata` json,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_roles_roleKey_unique` UNIQUE(`roleKey`)
);
--> statement-breakpoint
CREATE TABLE `chat_room_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	CONSTRAINT `chat_room_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_room_members_room_user_unique` UNIQUE(`roomId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `event_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`eventId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_favorites_user_event_unique` UNIQUE(`userId`,`eventId`)
);
--> statement-breakpoint
CREATE TABLE `external_role_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` enum('discord_role','square_plan') NOT NULL,
	`externalId` varchar(255) NOT NULL,
	`appRoleId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `external_role_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_role_mappings_source_external_unique` UNIQUE(`source`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `member_role_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberSubscriptionId` int NOT NULL,
	`userId` int,
	`appRoleId` int NOT NULL,
	`source` enum('discord','square','manual') NOT NULL,
	`externalId` varchar(255),
	`isActive` int NOT NULL DEFAULT 1,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_role_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_role_assignments_member_role_source_unique` UNIQUE(`memberSubscriptionId`,`appRoleId`,`source`)
);
--> statement-breakpoint
CREATE TABLE `private_member_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`targetUserId` int NOT NULL,
	`note` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `private_member_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `private_member_notes_owner_target_unique` UNIQUE(`ownerUserId`,`targetUserId`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_event_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`targetUserId` int,
	`chatRoomId` int,
	`action` enum('organizer_deadline','chat_seven_days','chat_two_days') NOT NULL,
	`scheduledFor` timestamp NOT NULL,
	`status` enum('pending','sent','canceled','failed') NOT NULL DEFAULT 'pending',
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduled_event_actions_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_event_actions_dedupe_unique` UNIQUE(`eventId`,`targetUserId`,`action`)
);
--> statement-breakpoint
ALTER TABLE `chat_rooms` MODIFY COLUMN `type` enum('direct','group','rank','event','board') NOT NULL;--> statement-breakpoint
ALTER TABLE `migration_imports` MODIFY COLUMN `importType` enum('members','events','participations','organizers','role_mappings') NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD `sourceId` varchar(255);--> statement-breakpoint
ALTER TABLE `events` ADD `applicationDeadline` timestamp;--> statement-breakpoint
ALTER TABLE `member_subscriptions` ADD `squarePlanVariationId` varchar(255);