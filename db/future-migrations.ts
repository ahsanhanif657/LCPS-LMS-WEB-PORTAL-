export const futureMigrations=[
 {name:'0003_quiz_attachments',statements:['ALTER TABLE "quizzes" ADD COLUMN "fileId" text']},
 {name:'0004_private_database_file_storage',statements:['CREATE TABLE IF NOT EXISTS "privateFileObjects" ("key" text PRIMARY KEY NOT NULL,"contents" blob NOT NULL,"metadata" text NOT NULL DEFAULT \'{}\')']},
];
