ALTER TABLE attendance ADD COLUMN remarks text;
ALTER TABLE users ADD COLUMN passwordPolicyVersion integer NOT NULL DEFAULT 0;
