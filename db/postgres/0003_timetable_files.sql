DROP INDEX IF EXISTS subjects_code_unique;
CREATE TABLE "timetableFiles" (
  id text PRIMARY KEY,
  "batchId" text NOT NULL REFERENCES batches(id),
  "fileId" text NOT NULL REFERENCES files(id),
  mime text NOT NULL,
  "createdAt" text NOT NULL
);
CREATE UNIQUE INDEX timetable_file_batch_unique ON timetableFiles ("batchId");
