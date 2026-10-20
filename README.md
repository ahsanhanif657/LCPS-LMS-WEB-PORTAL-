# LCPS LMS — Vercel edition

Start with **START_HERE.md** for deployment instructions in Roman Urdu.

Next.js 16 / React 19 / Node 24 application with SQLite/Turso persistence and explicitly configured private file storage. Existing LCPS academic workflows are retained; Cloudflare/Sites infrastructure and outer ChatGPT authentication are replaced for independent hosting.

## Development

Install Node 24, run `npm ci`, and run `npm run dev`. The local environment uses `TURSO_DATABASE_URL=file:./lcps-local.db`; this persistent SQLite file is ignored by source control and ZIP packaging. Preserve it and `.local-files/` to retain local accounts and uploads. For remote Turso, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the server environment. Never commit real `.env` files.

Commands: `npm run check` (types + integration tests), `npm run build`, `npm start`, `npm run setup-key`, and `npm run db:migrate`. SQLite/Turso migrations are idempotent; before changing a populated local database, the migration command creates a private snapshot. PostgreSQL migration assets are optional and are not needed for the current SQLite/Turso application. `lib/lms/seed.ts` is a test fixture only.

For local database recovery, preserve `lcps-local.db` and `.local-files/` together. Use the admin backup UI and separate protected copies; in-app backups include database records and metadata, not file bytes stored in Blob. Protect exports: they contain college data. Restoring a backup is an administrative operation and can replace records. Review college grading policies and user privileges before admitting real students.

## Accounts and permissions

The administrator creates and manages accounts, including HOD and other senior roles. An HOD with the `Create / edit authorized users` privilege can create and manage student and teacher accounts in their own department only. HODs cannot create or promote users to HOD, Principal, Admin, or staff roles, and cannot change user privileges or reset passwords. Account creation and role limits are enforced by the server as well as the portal UI.

## Attendance

Teachers select an assigned subject and class date, mark each enrolled student Present or Absent, review the complete class report, and submit it. Submission validates the full roster and records every attendance status together; the student attendance view refreshes from the saved records. Changing an existing status requires a correction reason. Students can view their own attendance and academic reports.

Students can also submit coursework, take scheduled quizzes, and view published results and assignment feedback.

## Report exports

Table exports and academic reports let users open a fixed report in a browser tab or download it as a Word document or ZIP archive. Choosing PDF opens the browser print dialog; select “Save as PDF” to save a static, non-fillable report. ZIP archives include an HTML report and CSV data. Exported records follow the same permission scope and filters as the visible table.

## File uploads and access

Profile photos and course attachments support PNG, JPG, WebP, PDF, Word (`.doc`/`.docx`), Excel (`.xls`/`.xlsx`), PowerPoint (`.ppt`/`.pptx`), CSV and ZIP files up to 4 MiB each. Teachers can add or replace attachments when editing assignments, quizzes and learning materials; students can attach supported files to submissions. PDF, images and CSV can be previewed in a browser where supported; other formats download for opening/editing in their desktop application. Replacing a file means editing it with that application and uploading the revised copy; the LMS is not an online Office editor.

In production, uploads and in-app backups require `FILE_STORAGE_MODE=blob` and a private `BLOB_READ_WRITE_TOKEN`; missing configuration fails explicitly rather than storing uploads in the database. Local development may use `FILE_STORAGE_MODE=local`, which stores private files under `.local-files/`; local mode is rejected on Vercel. Legacy objects in Blob, SQLite, or local storage remain readable for migration/recovery.

No paid services, accounts or cloud deployment are included in this ZIP. Provider plans, limits and charges apply. See `security/README.md` for implemented safeguards and `VERIFICATION.md` for testing scope.
