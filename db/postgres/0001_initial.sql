CREATE TABLE departments (id text PRIMARY KEY, name text NOT NULL UNIQUE, code text NOT NULL UNIQUE, active integer NOT NULL DEFAULT 1);
CREATE TABLE sessions (id text PRIMARY KEY, name text NOT NULL UNIQUE, active integer NOT NULL DEFAULT 1);
CREATE TABLE settings (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE users (
 id text PRIMARY KEY, name text NOT NULL, username text NOT NULL, email text, role text NOT NULL,
 "departmentId" text, "batchId" text, identifier text, phone text, designation text, office text,
 schedule text, avatar text, active integer NOT NULL DEFAULT 1, demo integer NOT NULL DEFAULT 0,
 "createdAt" text NOT NULL, permissions text NOT NULL DEFAULT '{}'
);
CREATE TABLE programs (id text PRIMARY KEY, name text NOT NULL, "departmentId" text NOT NULL, active integer NOT NULL DEFAULT 1);
CREATE TABLE batches (
 id text PRIMARY KEY, name text NOT NULL, "departmentId" text NOT NULL, "programId" text NOT NULL,
 "sessionId" text NOT NULL, semester integer NOT NULL, active integer NOT NULL DEFAULT 1
);
CREATE TABLE subjects (id text PRIMARY KEY, name text NOT NULL, code text NOT NULL, "departmentId" text NOT NULL, credits integer NOT NULL DEFAULT 3, active integer NOT NULL DEFAULT 1);
CREATE TABLE offerings (id text PRIMARY KEY, "subjectId" text NOT NULL, "batchId" text NOT NULL, "teacherId" text NOT NULL, active integer NOT NULL DEFAULT 1);
CREATE TABLE enrollments (id text PRIMARY KEY, "studentId" text NOT NULL, "offeringId" text NOT NULL, active integer NOT NULL DEFAULT 1);
CREATE TABLE "hodScopes" (id text PRIMARY KEY, "userId" text NOT NULL, "batchId" text NOT NULL);
CREATE TABLE timetable (id text PRIMARY KEY, "offeringId" text NOT NULL, day text NOT NULL, "startTime" text NOT NULL, "endTime" text NOT NULL, room text NOT NULL);
CREATE TABLE attendance (id text PRIMARY KEY, "offeringId" text NOT NULL, "studentId" text NOT NULL, date text NOT NULL, status text NOT NULL, reason text, "recordedBy" text NOT NULL);
CREATE TABLE assignments (
 id text PRIMARY KEY, "offeringId" text NOT NULL, title text NOT NULL, instructions text NOT NULL,
 "dueDate" text NOT NULL, "maxMarks" double precision NOT NULL, "allowLate" integer NOT NULL DEFAULT 0,
 published integer NOT NULL DEFAULT 0, "fileId" text
);
CREATE TABLE submissions (
 id text PRIMARY KEY, "assignmentId" text NOT NULL, "studentId" text NOT NULL, content text NOT NULL,
 "fileId" text, "submittedAt" text NOT NULL, marks double precision, feedback text
);
CREATE TABLE quizzes (
 id text PRIMARY KEY, "offeringId" text NOT NULL, title text NOT NULL, "opensAt" text NOT NULL,
 "closesAt" text NOT NULL, duration integer NOT NULL, questions text NOT NULL,
 published integer NOT NULL DEFAULT 0, release integer NOT NULL DEFAULT 0, "fileId" text
);
CREATE TABLE attempts (
 id text PRIMARY KEY, "quizId" text NOT NULL, "studentId" text NOT NULL, "startedAt" text NOT NULL,
 deadline text NOT NULL, "submittedAt" text, answers text NOT NULL DEFAULT '{}', score double precision
);
CREATE TABLE results (
 id text PRIMARY KEY, "offeringId" text NOT NULL, "studentId" text NOT NULL, title text NOT NULL,
 marks double precision NOT NULL, "maxMarks" double precision NOT NULL, published integer NOT NULL DEFAULT 0, feedback text
);
CREATE TABLE announcements (
 id text PRIMARY KEY, title text NOT NULL, body text NOT NULL, "departmentId" text, "batchId" text,
 "offeringId" text, "targetRole" text, "authorId" text NOT NULL, "createdAt" text NOT NULL
);
CREATE TABLE materials (id text PRIMARY KEY, "offeringId" text NOT NULL, title text NOT NULL, kind text NOT NULL, url text, "fileId" text);
CREATE TABLE progress (id text PRIMARY KEY, "materialId" text NOT NULL, "studentId" text NOT NULL, completed integer NOT NULL DEFAULT 0);
CREATE TABLE tasks (id text PRIMARY KEY, "userId" text NOT NULL, title text NOT NULL, "dueDate" text NOT NULL, status text NOT NULL DEFAULT 'Pending', notes text);
CREATE TABLE audit (id text PRIMARY KEY, "actorId" text NOT NULL, action text NOT NULL, entity text NOT NULL, "recordId" text, detail text, "createdAt" text NOT NULL);
CREATE TABLE credentials ("userId" text PRIMARY KEY, hash text NOT NULL);
CREATE TABLE "loginLimits" (key text PRIMARY KEY, count integer NOT NULL, expires bigint NOT NULL);
CREATE TABLE "loginSessions" ("tokenHash" text PRIMARY KEY, "userId" text NOT NULL, expires bigint NOT NULL);
CREATE TABLE previews ("authId" text PRIMARY KEY, "userId" text NOT NULL);
CREATE TABLE files (
 id text PRIMARY KEY, "ownerId" text NOT NULL, name text NOT NULL, mime text NOT NULL, size integer NOT NULL,
 purpose text NOT NULL, "createdAt" text NOT NULL, "storageProvider" text NOT NULL DEFAULT 'legacy',
 "storageKey" text, checksum text
);
CREATE TABLE "blobMetadata" (key text PRIMARY KEY, metadata text NOT NULL);
CREATE TABLE "privateFileObjects" (key text PRIMARY KEY, contents bytea NOT NULL, metadata text NOT NULL DEFAULT '{}');

ALTER TABLE users ADD CONSTRAINT users_department_fk FOREIGN KEY ("departmentId") REFERENCES departments(id);
ALTER TABLE users ADD CONSTRAINT users_batch_fk FOREIGN KEY ("batchId") REFERENCES batches(id);
ALTER TABLE programs ADD CONSTRAINT programs_department_fk FOREIGN KEY ("departmentId") REFERENCES departments(id);
ALTER TABLE batches ADD CONSTRAINT batches_department_fk FOREIGN KEY ("departmentId") REFERENCES departments(id);
ALTER TABLE batches ADD CONSTRAINT batches_program_fk FOREIGN KEY ("programId") REFERENCES programs(id);
ALTER TABLE batches ADD CONSTRAINT batches_session_fk FOREIGN KEY ("sessionId") REFERENCES sessions(id);
ALTER TABLE subjects ADD CONSTRAINT subjects_department_fk FOREIGN KEY ("departmentId") REFERENCES departments(id);
ALTER TABLE offerings ADD CONSTRAINT offerings_subject_fk FOREIGN KEY ("subjectId") REFERENCES subjects(id);
ALTER TABLE offerings ADD CONSTRAINT offerings_batch_fk FOREIGN KEY ("batchId") REFERENCES batches(id);
ALTER TABLE offerings ADD CONSTRAINT offerings_teacher_fk FOREIGN KEY ("teacherId") REFERENCES users(id);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_student_fk FOREIGN KEY ("studentId") REFERENCES users(id);
ALTER TABLE enrollments ADD CONSTRAINT enrollments_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE "hodScopes" ADD CONSTRAINT hodscopes_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE "hodScopes" ADD CONSTRAINT hodscopes_batch_fk FOREIGN KEY ("batchId") REFERENCES batches(id);
ALTER TABLE timetable ADD CONSTRAINT timetable_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE attendance ADD CONSTRAINT attendance_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE attendance ADD CONSTRAINT attendance_student_fk FOREIGN KEY ("studentId") REFERENCES users(id);
ALTER TABLE attendance ADD CONSTRAINT attendance_recorder_fk FOREIGN KEY ("recordedBy") REFERENCES users(id);
ALTER TABLE assignments ADD CONSTRAINT assignments_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE submissions ADD CONSTRAINT submissions_assignment_fk FOREIGN KEY ("assignmentId") REFERENCES assignments(id);
ALTER TABLE submissions ADD CONSTRAINT submissions_student_fk FOREIGN KEY ("studentId") REFERENCES users(id);
ALTER TABLE quizzes ADD CONSTRAINT quizzes_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE attempts ADD CONSTRAINT attempts_quiz_fk FOREIGN KEY ("quizId") REFERENCES quizzes(id);
ALTER TABLE attempts ADD CONSTRAINT attempts_student_fk FOREIGN KEY ("studentId") REFERENCES users(id);
ALTER TABLE results ADD CONSTRAINT results_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE results ADD CONSTRAINT results_student_fk FOREIGN KEY ("studentId") REFERENCES users(id);
ALTER TABLE announcements ADD CONSTRAINT announcements_department_fk FOREIGN KEY ("departmentId") REFERENCES departments(id);
ALTER TABLE announcements ADD CONSTRAINT announcements_batch_fk FOREIGN KEY ("batchId") REFERENCES batches(id);
ALTER TABLE announcements ADD CONSTRAINT announcements_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE announcements ADD CONSTRAINT announcements_author_fk FOREIGN KEY ("authorId") REFERENCES users(id);
ALTER TABLE materials ADD CONSTRAINT materials_offering_fk FOREIGN KEY ("offeringId") REFERENCES offerings(id);
ALTER TABLE progress ADD CONSTRAINT progress_material_fk FOREIGN KEY ("materialId") REFERENCES materials(id);
ALTER TABLE progress ADD CONSTRAINT progress_student_fk FOREIGN KEY ("studentId") REFERENCES users(id);
ALTER TABLE tasks ADD CONSTRAINT tasks_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE credentials ADD CONSTRAINT credentials_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE "loginSessions" ADD CONSTRAINT loginsessions_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE previews ADD CONSTRAINT previews_user_fk FOREIGN KEY ("userId") REFERENCES users(id);
ALTER TABLE files ADD CONSTRAINT files_owner_fk FOREIGN KEY ("ownerId") REFERENCES users(id);

CREATE UNIQUE INDEX users_username_unique ON users (lower(username));
CREATE UNIQUE INDEX users_email_unique ON users (email);
CREATE UNIQUE INDEX users_identifier_unique ON users (identifier);
CREATE UNIQUE INDEX batches_name_unique ON batches (name);
CREATE UNIQUE INDEX offerings_class_subject ON offerings ("subjectId","batchId");
CREATE UNIQUE INDEX enrollment_student_offering ON enrollments ("studentId","offeringId");
CREATE UNIQUE INDEX hod_scope_user_batch ON "hodScopes" ("userId","batchId");
CREATE UNIQUE INDEX attendance_unique ON attendance ("offeringId","studentId",date);
CREATE UNIQUE INDEX submission_unique ON submissions ("assignmentId","studentId");
CREATE UNIQUE INDEX attempt_unique ON attempts ("quizId","studentId");
CREATE UNIQUE INDEX result_unique ON results ("offeringId","studentId",title);
CREATE UNIQUE INDEX progress_unique ON progress ("materialId","studentId");
CREATE INDEX attendance_student_lookup ON attendance ("studentId","offeringId",date);
CREATE INDEX submission_student_lookup ON submissions ("studentId");
CREATE INDEX result_student_lookup ON results ("studentId",published);
CREATE INDEX session_expiry_lookup ON loginSessions (expires);
CREATE INDEX audit_created_lookup ON audit ("createdAt");
CREATE INDEX offering_teacher_lookup ON offerings ("teacherId");
CREATE INDEX batch_department_lookup ON batches ("departmentId");
CREATE INDEX file_owner_lookup ON files ("ownerId","createdAt");

UPDATE files SET "storageKey"=id WHERE "storageKey" IS NULL;
