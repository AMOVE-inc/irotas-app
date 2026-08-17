ALTER TABLE `member_subscriptions` ADD `discordRoles` json;--> statement-breakpoint
ALTER TABLE `member_subscriptions` ADD `discordJoinedAt` date;--> statement-breakpoint
ALTER TABLE `member_subscriptions` ADD `memberTerm` varchar(64);--> statement-breakpoint
ALTER TABLE `member_subscriptions` ADD `memberRank` varchar(64);