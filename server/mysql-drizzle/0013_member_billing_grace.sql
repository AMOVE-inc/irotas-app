ALTER TABLE `member_subscriptions` ADD `billingStatus` varchar(64);
ALTER TABLE `member_subscriptions` ADD `overdueSince` date;
ALTER TABLE `member_subscriptions` ADD `achievementBadges` json;
