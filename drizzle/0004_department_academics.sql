ALTER TABLE `quizzes` ADD COLUMN `topic` text;
--> statement-breakpoint
CREATE TABLE `resultFiles` (
	`id` text PRIMARY KEY NOT NULL,
	`offeringId` text NOT NULL,
	`fileId` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `result_file_offering_unique` ON `resultFiles` (`offeringId`);
--> statement-breakpoint
CREATE TABLE `assessmentPolicies` (
	`id` text PRIMARY KEY NOT NULL,
	`departmentId` text NOT NULL,
	`fileId` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_policy_department_unique` ON `assessmentPolicies` (`departmentId`);
