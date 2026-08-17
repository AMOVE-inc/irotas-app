ALTER TABLE `member_subscriptions` ADD `memberId` varchar(16);
ALTER TABLE `member_subscriptions` ADD `subscriptionRegisteredAt` timestamp;
CREATE UNIQUE INDEX `member_subscriptions_member_id_unique` ON `member_subscriptions` (`memberId`);
