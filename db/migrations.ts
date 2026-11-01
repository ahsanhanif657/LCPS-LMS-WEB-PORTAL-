// Bundled immutable SQL migrations; safe to import in serverless functions.
export const supplementalMigrations = [
  {
    name: '0009_attendance_password.sql',
    statements: [
      'ALTER TABLE attendance ADD COLUMN remarks text',
      'ALTER TABLE users ADD COLUMN passwordPolicyVersion integer NOT NULL DEFAULT 0',
    ],
  },
  {
    name: '0008_management_personal.sql',
    statements: [
      'ALTER TABLE users ADD COLUMN passwordChangeRequired integer NOT NULL DEFAULT 0',
      'CREATE TABLE personalEntries (id text PRIMARY KEY NOT NULL,userId text NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind text NOT NULL,title text NOT NULL,body text NOT NULL,dueDate text,status text NOT NULL,createdAt text NOT NULL,updatedAt text NOT NULL)',
      'CREATE INDEX personal_entries_owner ON personalEntries(userId)',
      'CREATE TABLE coursePolicies (id text PRIMARY KEY NOT NULL,offeringId text NOT NULL UNIQUE REFERENCES offerings(id) ON DELETE CASCADE,policy text NOT NULL,updatedBy text NOT NULL,updatedAt text NOT NULL)',
      'CREATE TABLE managementRecords (id text PRIMARY KEY NOT NULL,kind text NOT NULL,title text NOT NULL,body text NOT NULL,status text NOT NULL,amount real,eventDate text,createdBy text NOT NULL,createdAt text NOT NULL,updatedAt text NOT NULL)',
    ],
  },
  {
    name: '0007_teacher_qualifications.sql',
    statements: ['ALTER TABLE users ADD COLUMN qualifications text'],
  },
  {
    name: '0006_faculty_tasks.sql',
    statements: [
      "ALTER TABLE users ADD COLUMN responsibilities text NOT NULL DEFAULT '[]'",
      'ALTER TABLE loginSessions ADD COLUMN remindersSeen integer NOT NULL DEFAULT 0',
      "CREATE TABLE facultyTasks (id text PRIMARY KEY NOT NULL,userId text NOT NULL REFERENCES users(id),departmentId text NOT NULL REFERENCES departments(id),assignedBy text NOT NULL REFERENCES users(id),title text NOT NULL,instructions text NOT NULL,dueAt text NOT NULL,createdAt text NOT NULL,status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Submitted','Cancelled')),submittedAt text,response text,fileId text REFERENCES files(id))",
      'CREATE INDEX faculty_tasks_recipient ON facultyTasks(userId,status)',
    ],
  },
  {
    name: '0005_teacher_employment.sql',
    statements: [
      "ALTER TABLE users ADD COLUMN employmentType text CHECK (employmentType IS NULL OR employmentType IN ('Visiting','Permanent'))",
    ],
  },
  {
    name: '0003_timetable_files.sql',
    statements: [
      'DROP INDEX IF EXISTS `subjects_code_unique`',
      'CREATE TABLE `timetableFiles` (`id` text PRIMARY KEY NOT NULL, `batchId` text NOT NULL, `fileId` text NOT NULL, `mime` text NOT NULL, `createdAt` text NOT NULL, FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action)',
      'CREATE UNIQUE INDEX `timetable_file_batch_unique` ON `timetableFiles` (`batchId`)',
    ],
  },
  {
    name: '0004_department_academics.sql',
    statements: [
      'ALTER TABLE `quizzes` ADD COLUMN `topic` text',
      'CREATE TABLE `resultFiles` (`id` text PRIMARY KEY NOT NULL, `offeringId` text NOT NULL, `fileId` text NOT NULL, `createdAt` text NOT NULL, FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action)',
      'CREATE UNIQUE INDEX `result_file_offering_unique` ON `resultFiles` (`offeringId`)',
      'CREATE TABLE `assessmentPolicies` (`id` text PRIMARY KEY NOT NULL, `departmentId` text NOT NULL, `fileId` text NOT NULL, `createdAt` text NOT NULL, FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action)',
      'CREATE UNIQUE INDEX `assessment_policy_department_unique` ON `assessmentPolicies` (`departmentId`)',
    ],
  },
];
export const migrations = [
  {
    name: '0000_rainy_triathlon.sql',
    statements: [
      'CREATE TABLE `announcements` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`title` text NOT NULL,\n\t`body` text NOT NULL,\n\t`departmentId` text,\n\t`batchId` text,\n\t`offeringId` text,\n\t`targetRole` text,\n\t`authorId` text NOT NULL,\n\t`createdAt` text NOT NULL,\n\tFOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `assignments` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`offeringId` text NOT NULL,\n\t`title` text NOT NULL,\n\t`instructions` text NOT NULL,\n\t`dueDate` text NOT NULL,\n\t`maxMarks` real NOT NULL,\n\t`allowLate` integer DEFAULT 0 NOT NULL,\n\t`published` integer DEFAULT 0 NOT NULL,\n\t`fileId` text,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);',
      "CREATE TABLE `attempts` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`quizId` text NOT NULL,\n\t`studentId` text NOT NULL,\n\t`startedAt` text NOT NULL,\n\t`deadline` text NOT NULL,\n\t`submittedAt` text,\n\t`answers` text DEFAULT '{}' NOT NULL,\n\t`score` real,\n\tFOREIGN KEY (`quizId`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      'CREATE UNIQUE INDEX `attempt_unique` ON `attempts` (`quizId`,`studentId`);',
      'CREATE TABLE `attendance` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`offeringId` text NOT NULL,\n\t`studentId` text NOT NULL,\n\t`date` text NOT NULL,\n\t`status` text NOT NULL,\n\t`reason` text,\n\t`recordedBy` text NOT NULL,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `attendance_unique` ON `attendance` (`offeringId`,`studentId`,`date`);',
      'CREATE TABLE `audit` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`actorId` text NOT NULL,\n\t`action` text NOT NULL,\n\t`entity` text NOT NULL,\n\t`recordId` text,\n\t`detail` text,\n\t`createdAt` text NOT NULL\n);',
      'CREATE TABLE `batches` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`departmentId` text NOT NULL,\n\t`programId` text NOT NULL,\n\t`sessionId` text NOT NULL,\n\t`semester` integer NOT NULL,\n\t`active` integer DEFAULT 1 NOT NULL,\n\tFOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`programId`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `batches_name_unique` ON `batches` (`name`);',
      'CREATE TABLE `departments` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`code` text NOT NULL,\n\t`active` integer DEFAULT 1 NOT NULL\n);',
      'CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);',
      'CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);',
      'CREATE TABLE `enrollments` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`studentId` text NOT NULL,\n\t`offeringId` text NOT NULL,\n\t`active` integer DEFAULT 1 NOT NULL,\n\tFOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `enrollment_student_offering` ON `enrollments` (`studentId`,`offeringId`);',
      'CREATE TABLE `files` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`ownerId` text NOT NULL,\n\t`name` text NOT NULL,\n\t`mime` text NOT NULL,\n\t`size` integer NOT NULL,\n\t`purpose` text NOT NULL,\n\t`createdAt` text NOT NULL,\n\tFOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `hodScopes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`userId` text NOT NULL,\n\t`batchId` text NOT NULL,\n\tFOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `hod_scope_user_batch` ON `hodScopes` (`userId`,`batchId`);',
      'CREATE TABLE `materials` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`offeringId` text NOT NULL,\n\t`title` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`url` text,\n\t`fileId` text,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `offerings` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`subjectId` text NOT NULL,\n\t`batchId` text NOT NULL,\n\t`teacherId` text NOT NULL,\n\t`active` integer DEFAULT 1 NOT NULL,\n\tFOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `offering_class_subject` ON `offerings` (`subjectId`,`batchId`);',
      'CREATE TABLE `previews` (\n\t`authId` text PRIMARY KEY NOT NULL,\n\t`userId` text NOT NULL,\n\tFOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `programs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`departmentId` text NOT NULL,\n\t`active` integer DEFAULT 1 NOT NULL,\n\tFOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `progress` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`materialId` text NOT NULL,\n\t`studentId` text NOT NULL,\n\t`completed` integer DEFAULT 0 NOT NULL,\n\tFOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `progress_unique` ON `progress` (`materialId`,`studentId`);',
      'CREATE TABLE `quizzes` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`offeringId` text NOT NULL,\n\t`title` text NOT NULL,\n\t`opensAt` text NOT NULL,\n\t`closesAt` text NOT NULL,\n\t`duration` integer NOT NULL,\n\t`questions` text NOT NULL,\n\t`published` integer DEFAULT 0 NOT NULL,\n\t`release` integer DEFAULT 0 NOT NULL,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `results` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`offeringId` text NOT NULL,\n\t`studentId` text NOT NULL,\n\t`title` text NOT NULL,\n\t`marks` real NOT NULL,\n\t`maxMarks` real NOT NULL,\n\t`published` integer DEFAULT 0 NOT NULL,\n\t`feedback` text,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `result_unique` ON `results` (`offeringId`,`studentId`,`title`);',
      'CREATE TABLE `sessions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`active` integer DEFAULT 1 NOT NULL\n);',
      'CREATE UNIQUE INDEX `sessions_name_unique` ON `sessions` (`name`);',
      'CREATE TABLE `settings` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);',
      'CREATE TABLE `subjects` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`code` text NOT NULL,\n\t`departmentId` text NOT NULL,\n\t`credits` integer DEFAULT 3 NOT NULL,\n\t`active` integer DEFAULT 1 NOT NULL,\n\tFOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `subjects_code_unique` ON `subjects` (`code`);',
      'CREATE TABLE `submissions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`assignmentId` text NOT NULL,\n\t`studentId` text NOT NULL,\n\t`content` text NOT NULL,\n\t`fileId` text,\n\t`submittedAt` text NOT NULL,\n\t`marks` real,\n\t`feedback` text,\n\tFOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `submission_unique` ON `submissions` (`assignmentId`,`studentId`);',
      "CREATE TABLE `tasks` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`userId` text NOT NULL,\n\t`title` text NOT NULL,\n\t`dueDate` text NOT NULL,\n\t`status` text DEFAULT 'Pending' NOT NULL,\n\t`notes` text,\n\tFOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      'CREATE TABLE `timetable` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`offeringId` text NOT NULL,\n\t`day` text NOT NULL,\n\t`startTime` text NOT NULL,\n\t`endTime` text NOT NULL,\n\t`room` text NOT NULL,\n\tFOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `users` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`username` text NOT NULL,\n\t`email` text,\n\t`role` text NOT NULL,\n\t`departmentId` text,\n\t`batchId` text,\n\t`identifier` text,\n\t`phone` text,\n\t`designation` text,\n\t`office` text,\n\t`schedule` text,\n\t`avatar` text,\n\t`active` integer DEFAULT 1 NOT NULL,\n\t`demo` integer DEFAULT 0 NOT NULL,\n\t`createdAt` text NOT NULL,\n\tFOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);',
      'CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);',
      'CREATE UNIQUE INDEX `users_identifier_unique` ON `users` (`identifier`);',
    ],
  },
  {
    name: '0001_far_freak.sql',
    statements: [
      'CREATE TABLE `credentials` (\n\t`userId` text PRIMARY KEY NOT NULL,\n\t`hash` text NOT NULL,\n\tFOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      'CREATE TABLE `loginLimits` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`count` integer NOT NULL,\n\t`expires` integer NOT NULL\n);',
      'CREATE TABLE `loginSessions` (\n\t`tokenHash` text PRIMARY KEY NOT NULL,\n\t`userId` text NOT NULL,\n\t`expires` integer NOT NULL,\n\tFOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);',
      "ALTER TABLE `users` ADD `permissions` text DEFAULT '{}' NOT NULL;",
    ],
  },
  {
    name: '0002_academic_integrity.sql',
    statements: [
      'CREATE INDEX `attendance_student_lookup` ON `attendance` (`studentId`, `offeringId`, `date`);',
      'CREATE INDEX `submission_student_lookup` ON `submissions` (`studentId`);',
      'CREATE INDEX `result_student_lookup` ON `results` (`studentId`, `published`);',
      'CREATE INDEX `session_expiry_lookup` ON `loginSessions` (`expires`);',
      'CREATE INDEX `audit_created_lookup` ON `audit` (`createdAt`);',
      "CREATE TRIGGER `keep_last_administrator` BEFORE UPDATE OF role,active ON users\nWHEN OLD.role='ADMIN' AND OLD.active=1 AND OLD.demo=0 AND (NEW.role!='ADMIN' OR NEW.active!=1)\nAND NOT EXISTS (SELECT 1 FROM users WHERE id!=OLD.id AND role='ADMIN' AND active=1 AND demo=0)\nBEGIN SELECT RAISE(ABORT,'Keep at least one active administrator.'); END;",
      "CREATE TRIGGER `timetable_insert_conflict` BEFORE INSERT ON timetable\nWHEN NEW.endTime<=NEW.startTime OR EXISTS (\n SELECT 1 FROM timetable t JOIN offerings oldO ON oldO.id=t.offeringId JOIN offerings newO ON newO.id=NEW.offeringId\n WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime\n AND (lower(trim(t.room))=lower(trim(NEW.room)) OR oldO.teacherId=newO.teacherId OR oldO.batchId=newO.batchId))\nBEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END;",
      "CREATE TRIGGER `timetable_update_conflict` BEFORE UPDATE ON timetable\nWHEN NEW.endTime<=NEW.startTime OR EXISTS (\n SELECT 1 FROM timetable t JOIN offerings oldO ON oldO.id=t.offeringId JOIN offerings newO ON newO.id=NEW.offeringId\n WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime\n AND (lower(trim(t.room))=lower(trim(NEW.room)) OR oldO.teacherId=newO.teacherId OR oldO.batchId=newO.batchId))\nBEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END;",
      "CREATE TRIGGER `teacher_reassignment_conflict` BEFORE UPDATE OF teacherId ON offerings\nWHEN NEW.teacherId!=OLD.teacherId AND EXISTS (\n SELECT 1 FROM timetable a JOIN timetable b ON a.day=b.day AND a.startTime<b.endTime AND b.startTime<a.endTime\n JOIN offerings other ON other.id=b.offeringId\n WHERE a.offeringId=OLD.id AND b.offeringId!=OLD.id AND other.teacherId=NEW.teacherId)\nBEGIN SELECT RAISE(ABORT,'Teacher reassignment creates a timetable conflict.'); END;",
      "CREATE TRIGGER `result_insert_range` BEFORE INSERT ON results WHEN NEW.maxMarks<=0 OR NEW.marks<0 OR NEW.marks>NEW.maxMarks\nBEGIN SELECT RAISE(ABORT,'Marks must be within the assessment range.'); END;",
      "CREATE TRIGGER `result_update_range` BEFORE UPDATE ON results WHEN NEW.maxMarks<=0 OR NEW.marks<0 OR NEW.marks>NEW.maxMarks\nBEGIN SELECT RAISE(ABORT,'Marks must be within the assessment range.'); END;",
      'CREATE INDEX `offering_teacher_lookup` ON `offerings` (`teacherId`);',
      'CREATE INDEX `batch_department_lookup` ON `batches` (`departmentId`);',
    ],
  },
  {
    name: '0003_vercel_blob_metadata.sql',
    statements: ['CREATE TABLE blobMetadata (key TEXT PRIMARY KEY, metadata TEXT NOT NULL)'],
  },
];

supplementalMigrations.push({
  name: '0010_portal_enhancements.sql',
  statements: [
    'ALTER TABLE "offerings" ADD COLUMN "coTeacherId" TEXT',
    'ALTER TABLE "users" ADD COLUMN "bio" TEXT',
    'ALTER TABLE "users" ADD COLUMN "profileLinks" TEXT',
    'ALTER TABLE "users" ADD COLUMN "profileNote" TEXT',
    'ALTER TABLE "assignments" ADD COLUMN "updatedBy" TEXT',
    'ALTER TABLE "quizzes" ADD COLUMN "updatedBy" TEXT',
    'ALTER TABLE "materials" ADD COLUMN "updatedBy" TEXT',
    'ALTER TABLE "results" ADD COLUMN "updatedBy" TEXT',
    'ALTER TABLE "timetable" ADD COLUMN "updatedBy" TEXT',
    'ALTER TABLE "submissions" ADD COLUMN "gradedBy" TEXT',
    'CREATE TABLE "scheduleEvents" ("id" TEXT PRIMARY KEY NOT NULL,"batchId" TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,"kind" TEXT NOT NULL,"title" TEXT NOT NULL,"day" TEXT NOT NULL,"startTime" TEXT NOT NULL,"endTime" TEXT NOT NULL,"room" TEXT,"updatedBy" TEXT NOT NULL)',
    'CREATE INDEX "offering_co_teacher_lookup" ON offerings(coTeacherId)',
  ],
});

supplementalMigrations.push({
  name: '0011_schedule_safeguards.sql',
  statements: [
    "CREATE TRIGGER timetable_co_teacher_insert BEFORE INSERT ON timetable WHEN EXISTS (SELECT 1 FROM timetable t JOIN offerings a ON a.id=t.offeringId JOIN offerings b ON b.id=NEW.offeringId WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (a.coTeacherId=b.teacherId OR a.teacherId=b.coTeacherId OR a.coTeacherId=b.coTeacherId)) OR EXISTS (SELECT 1 FROM scheduleEvents e JOIN offerings o ON o.id=NEW.offeringId WHERE e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=o.batchId OR (e.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER schedule_event_insert_conflict BEFORE INSERT ON scheduleEvents WHEN NEW.endTime<=NEW.startTime OR EXISTS (SELECT 1 FROM scheduleEvents e WHERE e.id!=NEW.id AND e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) OR EXISTS (SELECT 1 FROM timetable t JOIN offerings o ON o.id=t.offeringId WHERE t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (o.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(t.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER timetable_co_teacher_update BEFORE UPDATE ON timetable WHEN EXISTS (SELECT 1 FROM timetable t JOIN offerings a ON a.id=t.offeringId JOIN offerings b ON b.id=NEW.offeringId WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (a.coTeacherId=b.teacherId OR a.teacherId=b.coTeacherId OR a.coTeacherId=b.coTeacherId)) OR EXISTS (SELECT 1 FROM scheduleEvents e JOIN offerings o ON o.id=NEW.offeringId WHERE e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=o.batchId OR (e.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER schedule_event_update_conflict BEFORE UPDATE ON scheduleEvents WHEN NEW.endTime<=NEW.startTime OR EXISTS (SELECT 1 FROM scheduleEvents e WHERE e.id!=NEW.id AND e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) OR EXISTS (SELECT 1 FROM timetable t JOIN offerings o ON o.id=t.offeringId WHERE t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (o.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(t.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER co_teacher_reassignment_conflict BEFORE UPDATE OF teacherId,coTeacherId ON offerings WHEN EXISTS (SELECT 1 FROM timetable a JOIN timetable b ON a.day=b.day AND a.startTime<b.endTime AND b.startTime<a.endTime JOIN offerings other ON other.id=b.offeringId WHERE a.offeringId=OLD.id AND b.offeringId!=OLD.id AND (other.teacherId=NEW.teacherId OR other.coTeacherId=NEW.teacherId OR other.teacherId=NEW.coTeacherId OR other.coTeacherId=NEW.coTeacherId)) BEGIN SELECT RAISE(ABORT,'Teacher reassignment creates a timetable conflict.'); END",
  ],
});
