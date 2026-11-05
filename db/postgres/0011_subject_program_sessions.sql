CREATE TABLE IF NOT EXISTS "subjectPrograms" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "subjectId" TEXT NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "programId" TEXT NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "subject_program_unique" ON "subjectPrograms" ("subjectId", "programId");
CREATE TABLE IF NOT EXISTS "subjectSessions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "subjectId" TEXT NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "programId" TEXT NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "subject_program_session_unique" ON "subjectSessions" ("subjectId", "programId", "sessionId");
