CREATE TABLE "subjectPrograms" (
	"id" text PRIMARY KEY NOT NULL,
	"subjectId" text NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
	"programId" text NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "subject_program_unique" ON "subjectPrograms" ("subjectId","programId");
CREATE TABLE "subjectSessions" (
	"id" text PRIMARY KEY NOT NULL,
	"subjectId" text NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
	"programId" text NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
	"sessionId" text NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "subject_program_session_unique" ON "subjectSessions" ("subjectId","programId","sessionId");
