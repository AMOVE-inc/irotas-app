CREATE TABLE `allowed_emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`note` text,
	`addedBy` int,
	`isRegistered` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `allowed_emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `allowed_emails_email_unique` UNIQUE(`email`)
);
