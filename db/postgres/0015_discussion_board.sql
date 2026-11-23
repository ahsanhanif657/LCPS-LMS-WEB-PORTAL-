CREATE TABLE "discussionThreads" (
  id text PRIMARY KEY,
  "offeringId" text NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  "authorId" text NOT NULL REFERENCES users(id),
  title text NOT NULL,
  body text NOT NULL,
  pinned integer NOT NULL DEFAULT 0,
  locked integer NOT NULL DEFAULT 0,
  "createdAt" text NOT NULL,
  "updatedAt" text NOT NULL
);
CREATE TABLE "discussionPosts" (
  id text PRIMARY KEY,
  "threadId" text NOT NULL REFERENCES "discussionThreads"(id) ON DELETE CASCADE,
  "authorId" text NOT NULL REFERENCES users(id),
  body text NOT NULL,
  "createdAt" text NOT NULL
);
CREATE INDEX "discussion_threads_offering_recent" ON "discussionThreads" ("offeringId", "updatedAt");
CREATE INDEX "discussion_posts_thread_recent" ON "discussionPosts" ("threadId", "createdAt");
