ALTER TABLE `quiz_sessions` ADD `guestSessionHash` varchar(64) NULL;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `updatedAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `expiresAt` timestamp NULL;--> statement-breakpoint
UPDATE `quiz_sessions` SET `guestSessionHash` = SHA2(CONCAT('legacy-', `id`), 256), `updatedAt` = COALESCE(`createdAt`, NOW()), `expiresAt` = DATE_ADD(COALESCE(`createdAt`, NOW()), INTERVAL 90 DAY) WHERE `guestSessionHash` IS NULL;--> statement-breakpoint
ALTER TABLE `quiz_sessions` MODIFY `guestSessionHash` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_sessions` MODIFY `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `quiz_sessions` MODIFY `expiresAt` timestamp NOT NULL;
