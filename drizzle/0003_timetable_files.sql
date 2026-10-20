DROP INDEX IF EXISTS `subjects_code_unique`;
--> statement-breakpoint
CREATE TABLE `timetableFiles` (
	`id` text PRIMARY KEY NOT NULL,
	`batchId` text NOT NULL,
	`fileId` text NOT NULL,
	`mime` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetable_file_batch_unique` ON `timetableFiles` (`batchId`);
