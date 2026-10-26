ALTER TABLE users ADD COLUMN responsibilities text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE loginSessions ADD COLUMN remindersSeen integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE facultyTasks (id text PRIMARY KEY NOT NULL,userId text NOT NULL REFERENCES users(id),departmentId text NOT NULL REFERENCES departments(id),assignedBy text NOT NULL REFERENCES users(id),title text NOT NULL,instructions text NOT NULL,dueAt text NOT NULL,createdAt text NOT NULL,status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Submitted','Cancelled')),submittedAt text,response text,fileId text REFERENCES files(id));
--> statement-breakpoint
CREATE INDEX faculty_tasks_recipient ON facultyTasks(userId,status);
