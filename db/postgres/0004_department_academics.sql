ALTER TABLE quizzes ADD COLUMN topic text;
CREATE TABLE "resultFiles" (
  id text PRIMARY KEY,
  "offeringId" text NOT NULL REFERENCES offerings(id),
  "fileId" text NOT NULL REFERENCES files(id),
  "createdAt" text NOT NULL
);
CREATE UNIQUE INDEX result_file_offering_unique ON resultFiles ("offeringId");
CREATE TABLE "assessmentPolicies" (
  id text PRIMARY KEY,
  "departmentId" text NOT NULL REFERENCES departments(id),
  "fileId" text NOT NULL REFERENCES files(id),
  "createdAt" text NOT NULL
);
CREATE UNIQUE INDEX assessment_policy_department_unique ON assessmentPolicies ("departmentId");
