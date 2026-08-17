CREATE TABLE `event_cancellation_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`userId` int NOT NULL,
	`contactedOrganizer` int NOT NULL DEFAULT 1,
	`policyConfirmed` int NOT NULL DEFAULT 1,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedBy` int,
	CONSTRAINT `event_cancellation_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `event_cancellation_requests_lookup_idx` ON `event_cancellation_requests` (`eventId`,`userId`,`status`);