# LCPS LMS — Management, assessment policy and personal workspace update

Based on your LCPS_LMS_Vercel_Ready(10).zip. This is the edited project source, not a prompt. No new glass redesign is applied; the uploaded project's existing appearance is retained.

## Apply to your existing project

1. Stop the running portal with Ctrl+C. Keep a verified backup of your database and uploaded files.
2. Extract this ZIP into a NEW folder OUTSIDE your existing project.
3. Double-click APPLY_UPDATE.cmd in the extracted folder and paste the path of your EXISTING project (the folder containing package.json).
4. The helper backs up replaced source files in a sibling LCPS_LMS_source_backups folder, then copies the files listed in UPDATED_FILES.json. It leaves .env files, databases, uploads, .git and node_modules alone.
5. Open your existing project in VS Code and run these commands separately:

```bat
npm.cmd run db:migrate
npm.cmd run build
npm.cmd run start
```

Open http://localhost:3000 and use your existing login. Do not run /setup again on an existing database. Node.js 24.x is required. If dependencies are absent, run `npm.cmd ci` first.

For development instead of production start:

```bat
npm.cmd run dev -- --webpack
```

### Keep your existing portal untouched while previewing

Make a separate copy of your existing project, including your local .env configuration, local SQLite database and local uploaded files. Apply the update to that COPY. Configure it to use its own copied database and upload directory, then run it on a different port:

```bat
npm.cmd run db:migrate
npm.cmd run dev -- --webpack --port 3001
```

Open http://localhost:3001. If your current environment points to remote Turso or Blob storage, copying .env still points to the LIVE data. Use separate test database/storage settings for an isolated preview.

### Remote Turso

After creating a verified provider backup, run `npm.cmd run db:migrate -- --remote-backup-confirmed`. The existing runtime remains SQLite/Turso-based. PostgreSQL migration/import companion files were updated, but this release does not switch database providers. No Git push or Vercel deployment has been performed.

## Included changes

1. Course outlines → select course → Assessment policy. Reference layout: Assignment 2%, Quiz 3%, Attendance 2%, Participation / Presentation 3%, Mid Term 30%, Final 60%, plus assessment methods. Admin and the course department's HOD can edit; teachers/students can only read. Weights must total 100%. Policies are course-specific and independent of the existing GPA grading configuration.
2. New accounts, including new setup administrators, must change their password before using any protected portal/file/backup API. Administrator password resets re-enable this requirement and revoke sessions. The new password must differ from the current password. Existing pre-update accounts keep their current access because the old system did not store reliable first-login completion state; reset an existing user's password to require a change.
3. Every role has My diary & to-do. Add/edit/delete personal entries, dates and notes; mark to-dos done or pending. Data loading and writes enforce the signed-in owner. Other portal users, including administrators, cannot browse or modify those entries through the personal module. Disaster-recovery database backups retain these records.
4. Icons removed from interface controls and decoration; subject artwork and the requested social brand icons remain. Icon-only controls now have text labels. College logos, profile photos and checkboxes are preserved.
5. Large dashboard green banner replaced with your five social links and management announcements. Announcements use the existing department/class/role audience filters. Management authors' notices appear in this area for eligible recipients.
6. Admin User management offers TREASURER, EXAMINATION_CONTROLLER and REGISTRAR. Their workspace is grouped under Management. Treasurer: finance/account records with PKR amount, date, status and details. Examination Controller: campus examination records plus campus result entry, uploads and deletion within granted permissions. Registrar: event and transport records. All three can publish their own announcements. Admin Role Privileges controls finance, exams, events, transport and existing module permissions; individual Deny overrides are enforced. These are campus administration record workflows, not a payment gateway, automated accounting engine or vehicle-tracking integration.
7. HOD departmental title now reads Dept. Examination Controller. Responsibility checkboxes are on the left.
8. Authorized teachers/HODs can delete uploaded result sheets from Results → Result sheets, with confirmation and scope checks. Entered assessment marks are not removed. Deletion unlinks the published sheet; the stored original is retained for recovery.

## Recovery and compatibility

The SQLite migration adds one user flag and three new tables without replacing existing rows. Local populated databases receive a pre-migration snapshot through the existing migration helper. Old v1 in-app backups restore with empty new tables and password flags defaulted to completed for legacy accounts. Updated backups preserve new entries, policies, records and flags. Source rollback copies are outside the project. Preserve a database backup alongside the source backup.

See VERIFICATION.md for validation and limits. Never upload your .env or local database to GitHub.
