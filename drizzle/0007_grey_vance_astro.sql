CREATE TABLE `email_verification_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`codeHash` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_organizers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`userId` int,
	`discordUserId` varchar(32),
	`organizerRole` enum('primary','assistant') NOT NULL DEFAULT 'primary',
	`source` enum('app','discord','csv','manual') NOT NULL DEFAULT 'csv',
	`needsReview` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_organizers_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_organizers_event_discord_unique` UNIQUE(`eventId`,`discordUserId`)
);
--> statement-breakpoint
CREATE TABLE `event_participations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`userId` int,
	`discordUserId` varchar(32),
	`status` enum('applied','confirmed','attended','canceled','no_show') NOT NULL,
	`source` enum('app','discord','csv','manual') NOT NULL DEFAULT 'csv',
	`sourceReference` varchar(512),
	`needsReview` int NOT NULL DEFAULT 0,
	`occurredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_participations_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_participations_event_discord_unique` UNIQUE(`eventId`,`discordUserId`)
);
--> statement-breakpoint
CREATE TABLE `member_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`billingEmail` varchar(320) NOT NULL,
	`discordUserId` varchar(32),
	`discordName` varchar(255),
	`displayName` varchar(255),
	`squareCustomerId` varchar(255),
	`squareSubscriptionId` varchar(255),
	`squareStatus` enum('PENDING','ACTIVE','CANCELED','DEACTIVATED','PAUSED','COMPLETED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
	`accessStatus` enum('pending','active','grace','suspended') NOT NULL DEFAULT 'pending',
	`paidUntilDate` date,
	`graceUntilDate` date,
	`lastSquareSyncedAt` timestamp,
	`suspendedAt` timestamp,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_subscriptions_billing_email_unique` UNIQUE(`billingEmail`),
	CONSTRAINT `member_subscriptions_discord_user_id_unique` UNIQUE(`discordUserId`),
	CONSTRAINT `member_subscriptions_square_subscription_id_unique` UNIQUE(`squareSubscriptionId`)
);
--> statement-breakpoint
CREATE TABLE `migration_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`importType` enum('members','events','participations','organizers') NOT NULL,
	`status` enum('success','partial','failed') NOT NULL,
	`importedCount` int NOT NULL DEFAULT 0,
	`reviewCount` int NOT NULL DEFAULT 0,
	`errorSummary` text,
	`importedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `migration_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `square_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(255) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `square_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `square_webhook_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `externalEventId` varchar(255);--> statement-breakpoint
ALTER TABLE `events` ADD `source` enum('app','discord','csv') DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `eventType` enum('official','gourmet') DEFAULT 'gourmet' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_external_event_id_unique` UNIQUE(`externalEventId`);