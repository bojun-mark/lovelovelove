CREATE TABLE `quiz_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nickname` varchar(80) NOT NULL,
	`birthYear` varchar(4) NOT NULL,
	`birthMonth` varchar(2) NOT NULL,
	`birthDay` varchar(2) NOT NULL,
	`birthTime` varchar(8) NOT NULL,
	`birthPlace` varchar(120) NOT NULL,
	`email` varchar(320) NOT NULL,
	`colors` text NOT NULL,
	`answers` text NOT NULL,
	`category` varchar(80) NOT NULL,
	`subQuestion` text NOT NULL,
	`plan` varchar(80) NOT NULL,
	`amount` int NOT NULL,
	`status` enum('pending','paid') NOT NULL DEFAULT 'paid',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quiz_sessions_id` PRIMARY KEY(`id`)
);
