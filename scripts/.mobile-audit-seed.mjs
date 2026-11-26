// lib/database.ts
import { createClient } from "@libsql/client";

// security/errors.ts
var AppError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
};

// db/migrations.ts
var supplementalMigrations = [
  {
    name: "0009_attendance_password.sql",
    statements: [
      "ALTER TABLE attendance ADD COLUMN remarks text",
      "ALTER TABLE users ADD COLUMN passwordPolicyVersion integer NOT NULL DEFAULT 0"
    ]
  },
  {
    name: "0008_management_personal.sql",
    statements: [
      "ALTER TABLE users ADD COLUMN passwordChangeRequired integer NOT NULL DEFAULT 0",
      "CREATE TABLE personalEntries (id text PRIMARY KEY NOT NULL,userId text NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind text NOT NULL,title text NOT NULL,body text NOT NULL,dueDate text,status text NOT NULL,createdAt text NOT NULL,updatedAt text NOT NULL)",
      "CREATE INDEX personal_entries_owner ON personalEntries(userId)",
      "CREATE TABLE coursePolicies (id text PRIMARY KEY NOT NULL,offeringId text NOT NULL UNIQUE REFERENCES offerings(id) ON DELETE CASCADE,policy text NOT NULL,updatedBy text NOT NULL,updatedAt text NOT NULL)",
      "CREATE TABLE managementRecords (id text PRIMARY KEY NOT NULL,kind text NOT NULL,title text NOT NULL,body text NOT NULL,status text NOT NULL,amount real,eventDate text,createdBy text NOT NULL,createdAt text NOT NULL,updatedAt text NOT NULL)"
    ]
  },
  {
    name: "0007_teacher_qualifications.sql",
    statements: ["ALTER TABLE users ADD COLUMN qualifications text"]
  },
  {
    name: "0006_faculty_tasks.sql",
    statements: [
      "ALTER TABLE users ADD COLUMN responsibilities text NOT NULL DEFAULT '[]'",
      "ALTER TABLE loginSessions ADD COLUMN remindersSeen integer NOT NULL DEFAULT 0",
      "CREATE TABLE facultyTasks (id text PRIMARY KEY NOT NULL,userId text NOT NULL REFERENCES users(id),departmentId text NOT NULL REFERENCES departments(id),assignedBy text NOT NULL REFERENCES users(id),title text NOT NULL,instructions text NOT NULL,dueAt text NOT NULL,createdAt text NOT NULL,status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Submitted','Cancelled')),submittedAt text,response text,fileId text REFERENCES files(id))",
      "CREATE INDEX faculty_tasks_recipient ON facultyTasks(userId,status)"
    ]
  },
  {
    name: "0005_teacher_employment.sql",
    statements: [
      "ALTER TABLE users ADD COLUMN employmentType text CHECK (employmentType IS NULL OR employmentType IN ('Visiting','Permanent'))"
    ]
  },
  {
    name: "0003_timetable_files.sql",
    statements: [
      "DROP INDEX IF EXISTS `subjects_code_unique`",
      "CREATE TABLE `timetableFiles` (`id` text PRIMARY KEY NOT NULL, `batchId` text NOT NULL, `fileId` text NOT NULL, `mime` text NOT NULL, `createdAt` text NOT NULL, FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action)",
      "CREATE UNIQUE INDEX `timetable_file_batch_unique` ON `timetableFiles` (`batchId`)"
    ]
  },
  {
    name: "0004_department_academics.sql",
    statements: [
      "ALTER TABLE `quizzes` ADD COLUMN `topic` text",
      "CREATE TABLE `resultFiles` (`id` text PRIMARY KEY NOT NULL, `offeringId` text NOT NULL, `fileId` text NOT NULL, `createdAt` text NOT NULL, FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action)",
      "CREATE UNIQUE INDEX `result_file_offering_unique` ON `resultFiles` (`offeringId`)",
      "CREATE TABLE `assessmentPolicies` (`id` text PRIMARY KEY NOT NULL, `departmentId` text NOT NULL, `fileId` text NOT NULL, `createdAt` text NOT NULL, FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action)",
      "CREATE UNIQUE INDEX `assessment_policy_department_unique` ON `assessmentPolicies` (`departmentId`)"
    ]
  }
];
var migrations = [
  {
    name: "0000_rainy_triathlon.sql",
    statements: [
      "CREATE TABLE `announcements` (\n	`id` text PRIMARY KEY NOT NULL,\n	`title` text NOT NULL,\n	`body` text NOT NULL,\n	`departmentId` text,\n	`batchId` text,\n	`offeringId` text,\n	`targetRole` text,\n	`authorId` text NOT NULL,\n	`createdAt` text NOT NULL,\n	FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `assignments` (\n	`id` text PRIMARY KEY NOT NULL,\n	`offeringId` text NOT NULL,\n	`title` text NOT NULL,\n	`instructions` text NOT NULL,\n	`dueDate` text NOT NULL,\n	`maxMarks` real NOT NULL,\n	`allowLate` integer DEFAULT 0 NOT NULL,\n	`published` integer DEFAULT 0 NOT NULL,\n	`fileId` text,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `attempts` (\n	`id` text PRIMARY KEY NOT NULL,\n	`quizId` text NOT NULL,\n	`studentId` text NOT NULL,\n	`startedAt` text NOT NULL,\n	`deadline` text NOT NULL,\n	`submittedAt` text,\n	`answers` text DEFAULT '{}' NOT NULL,\n	`score` real,\n	FOREIGN KEY (`quizId`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `attempt_unique` ON `attempts` (`quizId`,`studentId`);",
      "CREATE TABLE `attendance` (\n	`id` text PRIMARY KEY NOT NULL,\n	`offeringId` text NOT NULL,\n	`studentId` text NOT NULL,\n	`date` text NOT NULL,\n	`status` text NOT NULL,\n	`reason` text,\n	`recordedBy` text NOT NULL,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `attendance_unique` ON `attendance` (`offeringId`,`studentId`,`date`);",
      "CREATE TABLE `audit` (\n	`id` text PRIMARY KEY NOT NULL,\n	`actorId` text NOT NULL,\n	`action` text NOT NULL,\n	`entity` text NOT NULL,\n	`recordId` text,\n	`detail` text,\n	`createdAt` text NOT NULL\n);",
      "CREATE TABLE `batches` (\n	`id` text PRIMARY KEY NOT NULL,\n	`name` text NOT NULL,\n	`departmentId` text NOT NULL,\n	`programId` text NOT NULL,\n	`sessionId` text NOT NULL,\n	`semester` integer NOT NULL,\n	`active` integer DEFAULT 1 NOT NULL,\n	FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`programId`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `batches_name_unique` ON `batches` (`name`);",
      "CREATE TABLE `departments` (\n	`id` text PRIMARY KEY NOT NULL,\n	`name` text NOT NULL,\n	`code` text NOT NULL,\n	`active` integer DEFAULT 1 NOT NULL\n);",
      "CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);",
      "CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);",
      "CREATE TABLE `enrollments` (\n	`id` text PRIMARY KEY NOT NULL,\n	`studentId` text NOT NULL,\n	`offeringId` text NOT NULL,\n	`active` integer DEFAULT 1 NOT NULL,\n	FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `enrollment_student_offering` ON `enrollments` (`studentId`,`offeringId`);",
      "CREATE TABLE `files` (\n	`id` text PRIMARY KEY NOT NULL,\n	`ownerId` text NOT NULL,\n	`name` text NOT NULL,\n	`mime` text NOT NULL,\n	`size` integer NOT NULL,\n	`purpose` text NOT NULL,\n	`createdAt` text NOT NULL,\n	FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `hodScopes` (\n	`id` text PRIMARY KEY NOT NULL,\n	`userId` text NOT NULL,\n	`batchId` text NOT NULL,\n	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `hod_scope_user_batch` ON `hodScopes` (`userId`,`batchId`);",
      "CREATE TABLE `materials` (\n	`id` text PRIMARY KEY NOT NULL,\n	`offeringId` text NOT NULL,\n	`title` text NOT NULL,\n	`kind` text NOT NULL,\n	`url` text,\n	`fileId` text,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `offerings` (\n	`id` text PRIMARY KEY NOT NULL,\n	`subjectId` text NOT NULL,\n	`batchId` text NOT NULL,\n	`teacherId` text NOT NULL,\n	`active` integer DEFAULT 1 NOT NULL,\n	FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `offering_class_subject` ON `offerings` (`subjectId`,`batchId`);",
      "CREATE TABLE `previews` (\n	`authId` text PRIMARY KEY NOT NULL,\n	`userId` text NOT NULL,\n	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `programs` (\n	`id` text PRIMARY KEY NOT NULL,\n	`name` text NOT NULL,\n	`departmentId` text NOT NULL,\n	`active` integer DEFAULT 1 NOT NULL,\n	FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `progress` (\n	`id` text PRIMARY KEY NOT NULL,\n	`materialId` text NOT NULL,\n	`studentId` text NOT NULL,\n	`completed` integer DEFAULT 0 NOT NULL,\n	FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `progress_unique` ON `progress` (`materialId`,`studentId`);",
      "CREATE TABLE `quizzes` (\n	`id` text PRIMARY KEY NOT NULL,\n	`offeringId` text NOT NULL,\n	`title` text NOT NULL,\n	`opensAt` text NOT NULL,\n	`closesAt` text NOT NULL,\n	`duration` integer NOT NULL,\n	`questions` text NOT NULL,\n	`published` integer DEFAULT 0 NOT NULL,\n	`release` integer DEFAULT 0 NOT NULL,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `results` (\n	`id` text PRIMARY KEY NOT NULL,\n	`offeringId` text NOT NULL,\n	`studentId` text NOT NULL,\n	`title` text NOT NULL,\n	`marks` real NOT NULL,\n	`maxMarks` real NOT NULL,\n	`published` integer DEFAULT 0 NOT NULL,\n	`feedback` text,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `result_unique` ON `results` (`offeringId`,`studentId`,`title`);",
      "CREATE TABLE `sessions` (\n	`id` text PRIMARY KEY NOT NULL,\n	`name` text NOT NULL,\n	`active` integer DEFAULT 1 NOT NULL\n);",
      "CREATE UNIQUE INDEX `sessions_name_unique` ON `sessions` (`name`);",
      "CREATE TABLE `settings` (\n	`key` text PRIMARY KEY NOT NULL,\n	`value` text NOT NULL\n);",
      "CREATE TABLE `subjects` (\n	`id` text PRIMARY KEY NOT NULL,\n	`name` text NOT NULL,\n	`code` text NOT NULL,\n	`departmentId` text NOT NULL,\n	`credits` integer DEFAULT 3 NOT NULL,\n	`active` integer DEFAULT 1 NOT NULL,\n	FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `subjects_code_unique` ON `subjects` (`code`);",
      "CREATE TABLE `submissions` (\n	`id` text PRIMARY KEY NOT NULL,\n	`assignmentId` text NOT NULL,\n	`studentId` text NOT NULL,\n	`content` text NOT NULL,\n	`fileId` text,\n	`submittedAt` text NOT NULL,\n	`marks` real,\n	`feedback` text,\n	FOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `submission_unique` ON `submissions` (`assignmentId`,`studentId`);",
      "CREATE TABLE `tasks` (\n	`id` text PRIMARY KEY NOT NULL,\n	`userId` text NOT NULL,\n	`title` text NOT NULL,\n	`dueDate` text NOT NULL,\n	`status` text DEFAULT 'Pending' NOT NULL,\n	`notes` text,\n	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `timetable` (\n	`id` text PRIMARY KEY NOT NULL,\n	`offeringId` text NOT NULL,\n	`day` text NOT NULL,\n	`startTime` text NOT NULL,\n	`endTime` text NOT NULL,\n	`room` text NOT NULL,\n	FOREIGN KEY (`offeringId`) REFERENCES `offerings`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `users` (\n	`id` text PRIMARY KEY NOT NULL,\n	`name` text NOT NULL,\n	`username` text NOT NULL,\n	`email` text,\n	`role` text NOT NULL,\n	`departmentId` text,\n	`batchId` text,\n	`identifier` text,\n	`phone` text,\n	`designation` text,\n	`office` text,\n	`schedule` text,\n	`avatar` text,\n	`active` integer DEFAULT 1 NOT NULL,\n	`demo` integer DEFAULT 0 NOT NULL,\n	`createdAt` text NOT NULL,\n	FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,\n	FOREIGN KEY (`batchId`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);",
      "CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);",
      "CREATE UNIQUE INDEX `users_identifier_unique` ON `users` (`identifier`);"
    ]
  },
  {
    name: "0001_far_freak.sql",
    statements: [
      "CREATE TABLE `credentials` (\n	`userId` text PRIMARY KEY NOT NULL,\n	`hash` text NOT NULL,\n	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "CREATE TABLE `loginLimits` (\n	`key` text PRIMARY KEY NOT NULL,\n	`count` integer NOT NULL,\n	`expires` integer NOT NULL\n);",
      "CREATE TABLE `loginSessions` (\n	`tokenHash` text PRIMARY KEY NOT NULL,\n	`userId` text NOT NULL,\n	`expires` integer NOT NULL,\n	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action\n);",
      "ALTER TABLE `users` ADD `permissions` text DEFAULT '{}' NOT NULL;"
    ]
  },
  {
    name: "0002_academic_integrity.sql",
    statements: [
      "CREATE INDEX `attendance_student_lookup` ON `attendance` (`studentId`, `offeringId`, `date`);",
      "CREATE INDEX `submission_student_lookup` ON `submissions` (`studentId`);",
      "CREATE INDEX `result_student_lookup` ON `results` (`studentId`, `published`);",
      "CREATE INDEX `session_expiry_lookup` ON `loginSessions` (`expires`);",
      "CREATE INDEX `audit_created_lookup` ON `audit` (`createdAt`);",
      "CREATE TRIGGER `keep_last_administrator` BEFORE UPDATE OF role,active ON users\nWHEN OLD.role IN ('ADMIN','SUPER_ADMIN') AND OLD.active=1 AND OLD.demo=0 AND (NEW.role NOT IN ('ADMIN','SUPER_ADMIN') OR NEW.active!=1)\nAND NOT EXISTS (SELECT 1 FROM users WHERE id!=OLD.id AND role IN ('ADMIN','SUPER_ADMIN') AND active=1 AND demo=0)\nBEGIN SELECT RAISE(ABORT,'Keep at least one active administrator.'); END;",
      "CREATE TRIGGER `timetable_insert_conflict` BEFORE INSERT ON timetable\nWHEN NEW.endTime<=NEW.startTime OR EXISTS (\n SELECT 1 FROM timetable t JOIN offerings oldO ON oldO.id=t.offeringId JOIN offerings newO ON newO.id=NEW.offeringId\n WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime\n AND (lower(trim(t.room))=lower(trim(NEW.room)) OR oldO.teacherId=newO.teacherId OR oldO.batchId=newO.batchId))\nBEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END;",
      "CREATE TRIGGER `timetable_update_conflict` BEFORE UPDATE ON timetable\nWHEN NEW.endTime<=NEW.startTime OR EXISTS (\n SELECT 1 FROM timetable t JOIN offerings oldO ON oldO.id=t.offeringId JOIN offerings newO ON newO.id=NEW.offeringId\n WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime\n AND (lower(trim(t.room))=lower(trim(NEW.room)) OR oldO.teacherId=newO.teacherId OR oldO.batchId=newO.batchId))\nBEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END;",
      "CREATE TRIGGER `teacher_reassignment_conflict` BEFORE UPDATE OF teacherId ON offerings\nWHEN NEW.teacherId!=OLD.teacherId AND EXISTS (\n SELECT 1 FROM timetable a JOIN timetable b ON a.day=b.day AND a.startTime<b.endTime AND b.startTime<a.endTime\n JOIN offerings other ON other.id=b.offeringId\n WHERE a.offeringId=OLD.id AND b.offeringId!=OLD.id AND other.teacherId=NEW.teacherId)\nBEGIN SELECT RAISE(ABORT,'Teacher reassignment creates a timetable conflict.'); END;",
      "CREATE TRIGGER `result_insert_range` BEFORE INSERT ON results WHEN NEW.maxMarks<=0 OR NEW.marks<0 OR NEW.marks>NEW.maxMarks\nBEGIN SELECT RAISE(ABORT,'Marks must be within the assessment range.'); END;",
      "CREATE TRIGGER `result_update_range` BEFORE UPDATE ON results WHEN NEW.maxMarks<=0 OR NEW.marks<0 OR NEW.marks>NEW.maxMarks\nBEGIN SELECT RAISE(ABORT,'Marks must be within the assessment range.'); END;",
      "CREATE INDEX `offering_teacher_lookup` ON `offerings` (`teacherId`);",
      "CREATE INDEX `batch_department_lookup` ON `batches` (`departmentId`);"
    ]
  },
  {
    name: "0003_vercel_blob_metadata.sql",
    statements: ["CREATE TABLE blobMetadata (key TEXT PRIMARY KEY, metadata TEXT NOT NULL)"]
  }
];
supplementalMigrations.push({
  name: "0010_portal_enhancements.sql",
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
    'CREATE INDEX "offering_co_teacher_lookup" ON offerings(coTeacherId)'
  ]
});
supplementalMigrations.push({
  name: "0011_schedule_safeguards.sql",
  statements: [
    "CREATE TRIGGER timetable_co_teacher_insert BEFORE INSERT ON timetable WHEN EXISTS (SELECT 1 FROM timetable t JOIN offerings a ON a.id=t.offeringId JOIN offerings b ON b.id=NEW.offeringId WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (a.coTeacherId=b.teacherId OR a.teacherId=b.coTeacherId OR a.coTeacherId=b.coTeacherId)) OR EXISTS (SELECT 1 FROM scheduleEvents e JOIN offerings o ON o.id=NEW.offeringId WHERE e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=o.batchId OR (e.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER schedule_event_insert_conflict BEFORE INSERT ON scheduleEvents WHEN NEW.endTime<=NEW.startTime OR EXISTS (SELECT 1 FROM scheduleEvents e WHERE e.id!=NEW.id AND e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) OR EXISTS (SELECT 1 FROM timetable t JOIN offerings o ON o.id=t.offeringId WHERE t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (o.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(t.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER timetable_co_teacher_update BEFORE UPDATE ON timetable WHEN EXISTS (SELECT 1 FROM timetable t JOIN offerings a ON a.id=t.offeringId JOIN offerings b ON b.id=NEW.offeringId WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (a.coTeacherId=b.teacherId OR a.teacherId=b.coTeacherId OR a.coTeacherId=b.coTeacherId)) OR EXISTS (SELECT 1 FROM scheduleEvents e JOIN offerings o ON o.id=NEW.offeringId WHERE e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=o.batchId OR (e.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER schedule_event_update_conflict BEFORE UPDATE ON scheduleEvents WHEN NEW.endTime<=NEW.startTime OR EXISTS (SELECT 1 FROM scheduleEvents e WHERE e.id!=NEW.id AND e.day=NEW.day AND e.startTime<NEW.endTime AND NEW.startTime<e.endTime AND (e.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(e.room))=lower(trim(NEW.room))))) OR EXISTS (SELECT 1 FROM timetable t JOIN offerings o ON o.id=t.offeringId WHERE t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime AND (o.batchId=NEW.batchId OR (NEW.room IS NOT NULL AND lower(trim(t.room))=lower(trim(NEW.room))))) BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END",
    "CREATE TRIGGER co_teacher_reassignment_conflict BEFORE UPDATE OF teacherId,coTeacherId ON offerings WHEN EXISTS (SELECT 1 FROM timetable a JOIN timetable b ON a.day=b.day AND a.startTime<b.endTime AND b.startTime<a.endTime JOIN offerings other ON other.id=b.offeringId WHERE a.offeringId=OLD.id AND b.offeringId!=OLD.id AND (other.teacherId=NEW.teacherId OR other.coTeacherId=NEW.teacherId OR other.teacherId=NEW.coTeacherId OR other.coTeacherId=NEW.coTeacherId)) BEGIN SELECT RAISE(ABORT,'Teacher reassignment creates a timetable conflict.'); END"
  ]
});
supplementalMigrations.push({
  name: "0012_user_program.sql",
  statements: [
    'ALTER TABLE "users" ADD COLUMN "programId" TEXT',
    'ALTER TABLE "users" ADD COLUMN "sessionId" TEXT'
  ]
});
supplementalMigrations.push({
  name: "0013_subject_program_sessions.sql",
  statements: [
    'CREATE TABLE "subjectPrograms" ("id" TEXT PRIMARY KEY NOT NULL,"subjectId" TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,"programId" TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE)',
    'CREATE UNIQUE INDEX "subject_program_unique" ON "subjectPrograms" ("subjectId","programId")',
    'CREATE TABLE "subjectSessions" ("id" TEXT PRIMARY KEY NOT NULL,"subjectId" TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,"programId" TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,"sessionId" TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE)',
    'CREATE UNIQUE INDEX "subject_program_session_unique" ON "subjectSessions" ("subjectId","programId","sessionId")'
  ]
});
supplementalMigrations.push({
  name: "0014_subject_labs_resources.sql",
  statements: [
    `ALTER TABLE "subjects" ADD COLUMN "subjectType" TEXT NOT NULL DEFAULT 'Theory'`,
    'ALTER TABLE "subjects" ADD COLUMN "hasLab" INTEGER NOT NULL DEFAULT 0',
    `ALTER TABLE "materials" ADD COLUMN "resourceType" TEXT NOT NULL DEFAULT 'Document'`
  ]
});
supplementalMigrations.push({
  name: "0015_discussion_board.sql",
  statements: [
    'CREATE TABLE "discussionThreads" ("id" TEXT PRIMARY KEY NOT NULL,"offeringId" TEXT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,"authorId" TEXT NOT NULL REFERENCES users(id),"title" TEXT NOT NULL,"body" TEXT NOT NULL,"pinned" INTEGER NOT NULL DEFAULT 0,"locked" INTEGER NOT NULL DEFAULT 0,"createdAt" TEXT NOT NULL,"updatedAt" TEXT NOT NULL)',
    'CREATE TABLE "discussionPosts" ("id" TEXT PRIMARY KEY NOT NULL,"threadId" TEXT NOT NULL REFERENCES discussionThreads(id) ON DELETE CASCADE,"authorId" TEXT NOT NULL REFERENCES users(id),"body" TEXT NOT NULL,"createdAt" TEXT NOT NULL)',
    'CREATE INDEX "discussion_threads_offering_recent" ON "discussionThreads" ("offeringId","updatedAt")',
    'CREATE INDEX "discussion_posts_thread_recent" ON "discussionPosts" ("threadId","createdAt")'
  ]
});

// lib/database.ts
import { resolve } from "node:path";
var client;
function sqlClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url)
    throw new AppError(
      "SQLite is not connected. Configure TURSO_DATABASE_URL in the server environment.",
      503
    );
  return client = createClient({
    url,
    ...process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}
  });
}
async function execute(sql, args = []) {
  const result = await sqlClient().execute({ sql, args });
  return { results: result.rows, meta: { changes: Number(result.rowsAffected) } };
}
var Statement = class _Statement {
  constructor(sql, args = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new _Statement(
      this.sql,
      args.map((value) => value ?? null)
    );
  }
  async all() {
    return execute(this.sql, this.args);
  }
  async first() {
    return (await this.all()).results[0] ?? null;
  }
  async run() {
    return execute(this.sql, this.args);
  }
};
var database = {
  prepare: (sql) => new Statement(sql),
  async batch(statements) {
    if (!statements.length) return [];
    const results = await sqlClient().batch(
      statements.map((statement) => ({ sql: statement.sql, args: statement.args })),
      "write"
    );
    return results.map((result) => ({
      results: result.rows,
      meta: { changes: Number(result.rowsAffected) }
    }));
  }
};
async function hasObject(type, name) {
  const result = await sqlClient().execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type=? AND name=? LIMIT 1",
    args: [type, name]
  });
  return result.rows.length > 0;
}
async function hasColumn(table, column) {
  const result = await sqlClient().execute(`PRAGMA table_info("${table.replaceAll('"', '""')}")`);
  return result.rows.some((row) => row.name === column);
}
async function pendingLegacyMigrations() {
  const pending = [];
  for (const migration of [...migrations, ...supplementalMigrations])
    for (const statement of migration.statements) {
      const create = statement.match(
        /^\s*CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z0-9_]+)[`"]?/i
      );
      if (create) {
        if (create[1].toLowerCase() === "index" && create[2] === "subjects_code_unique") continue;
        if (!await hasObject(create[1].toLowerCase(), create[2])) pending.push(statement);
        continue;
      }
      const drop = statement.match(/^\s*DROP\s+INDEX\s+IF\s+EXISTS\s+[`"]?([A-Za-z0-9_]+)[`"]?/i);
      if (drop) {
        if (await hasObject("index", drop[1])) pending.push(statement);
        continue;
      }
      const alter = statement.match(
        /^\s*ALTER\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+ADD\s+(?:COLUMN\s+)?[`"]?([A-Za-z0-9_]+)[`"]?/i
      );
      if (alter) {
        if (!await hasColumn(alter[1], alter[2])) pending.push(statement);
        continue;
      }
      pending.push(statement);
    }
  return pending;
}
async function createLocalSnapshotIfNeeded(hasChanges) {
  const url = process.env.TURSO_DATABASE_URL || "";
  if (!hasChanges || !url.startsWith("file:") || !await hasObject("table", "users")) return;
  const count = await sqlClient().execute("SELECT COUNT(*) AS count FROM users");
  if (!Number(count.rows[0]?.count)) return;
  const rawPath = decodeURIComponent(url.slice(5).split("?")[0]);
  const sourcePath = resolve(process.cwd(), rawPath);
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  await sqlClient().execute({
    sql: "VACUUM INTO ?",
    args: [`${sourcePath}.before-schema-update-${stamp}.bak`]
  });
}
var administratorGuard = "CREATE TRIGGER keep_last_administrator BEFORE UPDATE OF role,active ON users\nWHEN OLD.role IN ('ADMIN','SUPER_ADMIN') AND OLD.active=1 AND OLD.demo=0 AND (NEW.role NOT IN ('ADMIN','SUPER_ADMIN') OR NEW.active!=1)\nAND NOT EXISTS (SELECT 1 FROM users WHERE id!=OLD.id AND role IN ('ADMIN','SUPER_ADMIN') AND active=1 AND demo=0)\nBEGIN SELECT RAISE(ABORT,'Keep at least one active administrator.'); END;";
async function runLegacyMigrations() {
  const pending = await pendingLegacyMigrations();
  const guard = await sqlClient().execute(
    "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='keep_last_administrator'"
  );
  const needsAdministratorGuard = !String(guard.rows[0]?.sql ?? "").includes(
    "role IN ('ADMIN','SUPER_ADMIN')"
  );
  const retireStaff = await hasObject("table", "users") && (await sqlClient().execute("SELECT 1 FROM users WHERE role='STAFF' LIMIT 1")).rows.length > 0;
  const needsFileColumns = !await hasColumn("files", "storageProvider") || !await hasColumn("files", "storageKey") || !await hasColumn("files", "checksum") || !await hasColumn("quizzes", "fileId");
  await createLocalSnapshotIfNeeded(
    pending.length > 0 || needsFileColumns || retireStaff || needsAdministratorGuard
  );
  for (const statement of pending) await sqlClient().execute(statement);
  if (needsAdministratorGuard) {
    await sqlClient().execute("DROP TRIGGER IF EXISTS keep_last_administrator");
    await sqlClient().execute(administratorGuard);
  }
  if (retireStaff) {
    await sqlClient().batch(
      [
        {
          sql: "DELETE FROM loginSessions WHERE userId IN (SELECT id FROM users WHERE role='STAFF')",
          args: []
        },
        {
          sql: "UPDATE users SET role='RETIRED',active=0,permissions='{}' WHERE role='STAFF'",
          args: []
        }
      ],
      "write"
    );
  }
}
async function ensureColumn(table, column, definition) {
  if (await hasColumn(table, column)) return;
  await sqlClient().execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
}
var ready;
function ensureDatabase() {
  if (!ready)
    ready = (async () => {
      try {
        await runLegacyMigrations();
        await sqlClient().execute(
          "UPDATE users SET role='SUPER_ADMIN' WHERE id=(SELECT value FROM settings WHERE key='owner') AND role='ADMIN'"
        );
        await ensureColumn("files", "storageProvider", "text NOT NULL DEFAULT 'legacy'");
        await ensureColumn("files", "storageKey", "text");
        await ensureColumn("files", "checksum", "text");
        await ensureColumn("quizzes", "fileId", "text");
        await ensureColumn("users", "programId", "text");
        await ensureColumn("users", "sessionId", "text");
        await sqlClient().execute(
          "UPDATE users SET programId=COALESCE(programId,(SELECT programId FROM batches WHERE id=users.batchId)),sessionId=COALESCE(sessionId,(SELECT sessionId FROM batches WHERE id=users.batchId)) WHERE batchId IS NOT NULL AND (programId IS NULL OR sessionId IS NULL)"
        );
        await sqlClient().execute("UPDATE files SET storageKey=id WHERE storageKey IS NULL");
        await sqlClient().execute(
          "CREATE TABLE IF NOT EXISTS privateFileObjects (key text PRIMARY KEY, contents blob NOT NULL, metadata text NOT NULL DEFAULT '{}')"
        );
        await sqlClient().execute(
          "CREATE TABLE IF NOT EXISTS blobMetadata (key text PRIMARY KEY, metadata text NOT NULL)"
        );
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          "SQLite is unavailable or its schema could not be upgraded safely. Check TURSO_DATABASE_URL and preserve a database backup before retrying.",
          503
        );
      }
    })().catch((error) => {
      ready = void 0;
      throw error;
    });
  return ready;
}

// lib/lms/seed.ts
function seedData() {
  const now = /* @__PURE__ */ new Date();
  const iso = (days) => new Date(now.getTime() + days * 864e5).toISOString();
  const d = {
    departments: [
      { id: "cs", name: "Computer Science", code: "CS", active: 1 },
      { id: "pharm", name: "Pharm-D", code: "PHARM", active: 1 },
      { id: "btech", name: "B.Tech", code: "BTECH", active: 1 }
    ],
    programs: [
      { id: "bscs", name: "BS Computer Science", departmentId: "cs", active: 1 },
      { id: "pharmd", name: "Doctor of Pharmacy", departmentId: "pharm", active: 1 },
      { id: "bt", name: "Bachelor of Technology", departmentId: "btech", active: 1 }
    ],
    sessions: [
      { id: "s24", name: "2024\u20132028", active: 1 },
      { id: "s25", name: "2025\u20132029", active: 1 }
    ],
    batches: [
      {
        id: "cs4",
        name: "BSCS-4A",
        departmentId: "cs",
        programId: "bscs",
        sessionId: "s24",
        semester: 4,
        active: 1
      },
      {
        id: "cs2",
        name: "BSCS-2A",
        departmentId: "cs",
        programId: "bscs",
        sessionId: "s25",
        semester: 2,
        active: 1
      },
      {
        id: "ph4",
        name: "PHARM-4A",
        departmentId: "pharm",
        programId: "pharmd",
        sessionId: "s24",
        semester: 4,
        active: 1
      },
      {
        id: "bt4",
        name: "BTECH-4A",
        departmentId: "btech",
        programId: "bt",
        sessionId: "s24",
        semester: 4,
        active: 1
      }
    ]
  };
  const user = (id, name, role, departmentId, batchId, identifier) => ({
    id,
    name,
    username: id,
    email: null,
    role,
    departmentId,
    batchId,
    identifier,
    phone: null,
    designation: role === "STAFF" ? "Academic Office Coordinator" : null,
    office: role === "STAFF" ? "Student Affairs" : null,
    schedule: role === "STAFF" ? "Monday\u2013Friday \xB7 09:00\u201317:00" : null,
    avatar: null,
    active: 1,
    demo: 1,
    createdAt: iso(-40)
  });
  d.users = [
    user("student", "Ahsan Hanif", "STUDENT", "cs", "cs4", "LCPS-BSCS-2024-001"),
    user("teacher", "Muhammad Tanvir", "TEACHER", "cs", null, "LCPS-T-102"),
    user("hod_cs", "Zubair Fuzail", "HOD", "cs", null, "LCPS-H-101"),
    user("hod_pharmd", "Dolat", "HOD", "pharm", null, "LCPS-H-102"),
    user("hod_btech", "Muhammad Bilal", "HOD", "btech", null, "LCPS-H-103"),
    user("principal", "Dr. Umair Ikram Dar", "PRINCIPAL", null, null, "LCPS-P-001"),
    user("admin", "LCPS Administrator", "ADMIN", null, null, "LCPS-A-001"),
    user("staff", "Demo Office Coordinator", "STAFF", "cs", null, "LCPS-S-001"),
    user("salman", "Salman Elahi", "TEACHER", "cs", null, "LCPS-T-103"),
    user("abdullah", "Abdullah", "TEACHER", "cs", null, "LCPS-T-104"),
    user("iqra", "Miss Iqra Qasim", "TEACHER", "cs", null, "LCPS-T-105"),
    user("student2", "Sara Ahmed", "STUDENT", "cs", "cs4", "LCPS-BSCS-2024-002"),
    user("student3", "Hamza Ali", "STUDENT", "cs", "cs2", "LCPS-BSCS-2025-001"),
    user("student4", "Demo Pharmacy Student", "STUDENT", "pharm", "ph4", "LCPS-PH-2024-001")
  ];
  d.subjects = [
    ["automata", "Theory of Automata", "CS-241"],
    ["mobile", "Mobile Application Development", "CS-242"],
    ["security", "Information Security", "CS-243"],
    ["database", "Database Administration", "CS-244"],
    ["writing", "Expository Writing", "ENG-201"],
    ["oop", "Object Oriented Programming", "CS-121"],
    ["lab", "Information Security Lab", "CS-243L"]
  ].map(([id, name, code]) => ({
    id,
    name,
    code,
    departmentId: "cs",
    credits: id === "lab" ? 1 : 3,
    active: 1
  }));
  d.offerings = d.subjects.map((s, i) => ({
    id: "off-" + s.id,
    subjectId: s.id,
    batchId: s.id === "oop" ? "cs2" : "cs4",
    teacherId: ["salman", "teacher", "hod_cs", "abdullah", "iqra", "teacher", "teacher"][i],
    active: 1
  }));
  d.enrollments = [];
  for (const st of d.users.filter((x) => x.role === "STUDENT"))
    for (const o of d.offerings.filter((o2) => o2.batchId === st.batchId && o2.subjectId !== "lab"))
      d.enrollments.push({
        id: "en-" + st.id + "-" + o.id,
        studentId: st.id,
        offeringId: o.id,
        active: 1
      });
  d.hodScopes = [
    { id: "scope1", userId: "hod_cs", batchId: "cs4" },
    { id: "scope2", userId: "hod_cs", batchId: "cs2" },
    { id: "scope3", userId: "hod_pharmd", batchId: "ph4" },
    { id: "scope4", userId: "hod_btech", batchId: "bt4" }
  ];
  d.timetable = [];
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
    const idx = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].indexOf(day);
    ["09:00", "11:00", "14:00"].forEach(
      (t, j) => d.timetable.push({
        id: "tt-" + idx + "-" + j,
        offeringId: d.offerings[(idx + j) % 5].id,
        day,
        startTime: t,
        endTime: ["10:00", "12:00", "15:00"][j],
        room: ["CS Lab 2", "Room 204", "Room 301"][j]
      })
    );
  }
  d.attendance = [];
  for (const en of d.enrollments)
    for (let i = 1; i <= 12; i++)
      d.attendance.push({
        id: "at-" + en.id + "-" + i,
        offeringId: en.offeringId,
        studentId: en.studentId,
        date: iso(-i).slice(0, 10),
        status: i === 7 ? "Absent" : i === 4 ? "Late" : "Present",
        recordedBy: d.offerings.find((o) => o.id === en.offeringId).teacherId,
        reason: null
      });
  d.assignments = [
    {
      id: "a1",
      offeringId: "off-mobile",
      title: "Build your first Android layout",
      instructions: "Create a responsive sign-in screen with input validation. Submit your source files or a repository link and a short explanation of your layout choices.",
      dueDate: iso(3),
      maxMarks: 20,
      allowLate: 0,
      published: 1,
      fileId: null
    },
    {
      id: "a2",
      offeringId: "off-database",
      title: "Database normalization case study",
      instructions: "Normalize a college enrollment dataset to third normal form. Include your ER diagram and explain the functional dependencies.",
      dueDate: iso(5),
      maxMarks: 25,
      allowLate: 1,
      published: 1,
      fileId: null
    },
    {
      id: "a3",
      offeringId: "off-automata",
      title: "DFA and NFA practice set",
      instructions: "Construct a finite automaton that accepts binary strings ending in 01. Explain the transition function and provide three test strings.",
      dueDate: iso(7),
      maxMarks: 15,
      allowLate: 0,
      published: 1,
      fileId: null
    }
  ];
  d.submissions = [];
  const questions = [
    {
      id: "q1",
      text: "Which Android component represents a single screen?",
      options: ["Service", "Activity", "Broadcast receiver", "Content provider"],
      correct: 1,
      marks: 5
    },
    {
      id: "q2",
      text: "Which layout arranges children in a single row or column?",
      options: ["FrameLayout", "ConstraintLayout", "LinearLayout", "GridView"],
      correct: 2,
      marks: 5
    },
    {
      id: "q3",
      text: "Which method starts an Activity lifecycle?",
      options: ["onCreate", "onStop", "onDestroy", "onPause"],
      correct: 0,
      marks: 5
    }
  ];
  d.quizzes = [
    {
      id: "quiz1",
      offeringId: "off-mobile",
      title: "Android fundamentals",
      opensAt: iso(-1),
      closesAt: iso(14),
      duration: 15,
      questions: JSON.stringify(questions),
      published: 1,
      release: 1
    }
  ];
  d.attempts = [];
  d.results = d.enrollments.filter((e) => e.studentId !== "student3").map((e, i) => ({
    id: "result-" + e.id,
    offeringId: e.offeringId,
    studentId: e.studentId,
    title: "Semester assessment 1",
    marks: 18 + i % 6,
    maxMarks: 25,
    published: 1,
    feedback: "Good progress. Review the practice exercises before the next assessment."
  }));
  d.announcements = [
    {
      id: "ann1",
      title: "Welcome to your academic portal",
      body: "Your classes, coursework and college updates, together in one place. Check your timetable and upcoming deadlines regularly.",
      departmentId: null,
      batchId: null,
      offeringId: null,
      targetRole: null,
      authorId: "principal",
      createdAt: iso(0)
    },
    {
      id: "ann2",
      title: "Computer Science project showcase",
      body: "Bring your latest project to the departmental showcase. Discuss your idea with your assigned teacher and prepare a five-minute demonstration.",
      departmentId: "cs",
      batchId: null,
      offeringId: null,
      targetRole: null,
      authorId: "hod_cs",
      createdAt: iso(-1)
    },
    {
      id: "ann3",
      title: "Mobile development lab preparation",
      body: "Review Android activities and layouts before your next lab. The fundamentals quiz is now available in your Quizzes tab.",
      departmentId: null,
      batchId: null,
      offeringId: "off-mobile",
      targetRole: null,
      authorId: "teacher",
      createdAt: iso(-2)
    }
  ];
  d.discussionThreads = [];
  d.discussionPosts = [];
  d.materials = d.offerings.flatMap((o) => [
    {
      id: "mat-" + o.id,
      offeringId: o.id,
      title: "Course introduction and learning outcomes",
      kind: "Link",
      url: o.subjectId === "mobile" ? "https://developer.android.com/courses" : o.subjectId === "database" ? "https://www.sqlite.org/docs.html" : "https://ocw.mit.edu/",
      fileId: null
    }
  ]);
  d.progress = [];
  d.tasks = [
    {
      id: "task1",
      userId: "staff",
      title: "Prepare the weekly student affairs register",
      dueDate: iso(2),
      status: "Pending",
      notes: "Review enrollment updates and prepare the office register."
    },
    {
      id: "task2",
      userId: "staff",
      title: "Coordinate classroom availability",
      dueDate: iso(4),
      status: "In progress",
      notes: "Confirm room availability with the academic office."
    }
  ];
  d.audit = [];
  d.timetableFiles = [];
  d.resultFiles = [];
  d.assessmentPolicies = [];
  return d;
}

// security/passwords.ts
var enc = new TextEncoder();
var hex = (b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
var token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function hashPassword(password, salt = token()) {
  if (typeof password !== "string" || password.length < 10 || password.length > 128)
    throw new Error("Password must contain 10\u2013128 characters.");
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 1e5, hash: "SHA-256" },
    key,
    256
  );
  return "pbkdf2$100000$" + salt + "$" + hex(bits);
}

// lib/lms/types.ts
var tables = [
  "departments",
  "programs",
  "sessions",
  "batches",
  "users",
  "subjects",
  "subjectPrograms",
  "subjectSessions",
  "offerings",
  "enrollments",
  "hodScopes",
  "scheduleEvents",
  "timetable",
  "timetableFiles",
  "resultFiles",
  "assessmentPolicies",
  "attendance",
  "assignments",
  "submissions",
  "quizzes",
  "attempts",
  "results",
  "announcements",
  "discussionThreads",
  "discussionPosts",
  "materials",
  "progress",
  "tasks",
  "facultyTasks",
  "personalEntries",
  "coursePolicies",
  "managementRecords",
  "audit"
];

// scripts/.mobile-audit-seed.ts
await ensureDatabase();
var data = seedData();
var passwordHash = await hashPassword("MobileAuditPass!23");
var users = data.users.map((user) => ({ ...user, demo: 0, passwordChangeRequired: 0, permissions: "{}" }));
var template = users.find((user) => user.id === "admin");
var extraRoles = ["SUPER_ADMIN", "DIRECTOR", "TREASURER", "EXAMINATION_CONTROLLER", "REGISTRAR"];
for (const role of extraRoles) {
  const id = role.toLowerCase();
  users.push({ ...template, id, name: `Audit ${role.replaceAll("_", " ")}`, username: id, role, departmentId: null, batchId: null, identifier: `AUDIT-${role}`, demo: 0, passwordChangeRequired: 0, permissions: "{}" });
}
var insertRow = async (table, row) => {
  const keys = Object.keys(row);
  await database.prepare(`INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...keys.map((key) => row[key] ?? null)).run();
};
for (const table of tables) {
  if (table === "users") {
    for (const user of users) await insertRow("users", user);
  } else {
    for (const row of data[table] || []) await insertRow(table, row);
  }
}
for (const user of users) await database.prepare("INSERT INTO credentials(userId,hash) VALUES(?,?)").bind(user.id, passwordHash).run();
for (const [key, value] of [["college_auth_v2", "1"], ["owner", "super_admin"], ["college", "LCPS Mobile Audit"]]) await database.prepare("INSERT INTO settings(key,value) VALUES(?,?)").bind(key, value).run();
console.log(`Seeded ${users.length} local test accounts and ${tables.length - 1} data tables.`);
