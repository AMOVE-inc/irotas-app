ALTER TABLE `users` ADD `branches` json;
--> statement-breakpoint
UPDATE `users` SET `branches` = JSON_ARRAY(`branch`) WHERE `branch` IS NOT NULL AND `branches` IS NULL;
