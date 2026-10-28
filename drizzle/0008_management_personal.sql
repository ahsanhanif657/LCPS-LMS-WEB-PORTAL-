ALTER TABLE users ADD COLUMN passwordChangeRequired integer NOT NULL DEFAULT 0;
CREATE TABLE personalEntries (id text PRIMARY KEY NOT NULL,userId text NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind text NOT NULL,title text NOT NULL,body text NOT NULL,dueDate text,status text NOT NULL,createdAt text NOT NULL,updatedAt text NOT NULL);
CREATE INDEX personal_entries_owner ON personalEntries(userId);
CREATE TABLE coursePolicies (id text PRIMARY KEY NOT NULL,offeringId text NOT NULL UNIQUE REFERENCES offerings(id) ON DELETE CASCADE,policy text NOT NULL,updatedBy text NOT NULL,updatedAt text NOT NULL);
CREATE TABLE managementRecords (id text PRIMARY KEY NOT NULL,kind text NOT NULL,title text NOT NULL,body text NOT NULL,status text NOT NULL,amount real,eventDate text,createdBy text NOT NULL,createdAt text NOT NULL,updatedAt text NOT NULL);
