ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "responsibilities" text NOT NULL DEFAULT '[]';
ALTER TABLE "loginSessions" ADD COLUMN IF NOT EXISTS "remindersSeen" integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "facultyTasks" (
 "id" text PRIMARY KEY NOT NULL, "userId" text NOT NULL REFERENCES "users"("id"),
 "departmentId" text NOT NULL REFERENCES "departments"("id"), "assignedBy" text NOT NULL REFERENCES "users"("id"),
 "title" text NOT NULL, "instructions" text NOT NULL, "dueAt" text NOT NULL, "createdAt" text NOT NULL,
 "status" text NOT NULL DEFAULT 'Pending' CHECK ("status" IN ('Pending','Submitted','Cancelled')),
 "submittedAt" text, "response" text, "fileId" text REFERENCES "files"("id")
);
CREATE INDEX IF NOT EXISTS "faculty_tasks_recipient" ON "facultyTasks"("userId","status");
DELETE FROM "loginSessions" WHERE "userId" IN (SELECT "id" FROM "users" WHERE "role"='STAFF');
UPDATE "users" SET "role"='RETIRED', "active"=0, "permissions"='{}' WHERE "role"='STAFF';
