# LCPS LMS — 16-feature update

This is a source update for your existing LCPS LMS, not a replacement database. Keep using the existing project and its environment settings. The update preserves the current blue design, roles, academic hierarchy and earlier attendance/results features except where the requested changes apply.

## Apply on Windows

1. Stop the running local server with Ctrl+C. Take a database backup/snapshot before this update. The updater's source backup does not include the hosted database or uploaded files.
2. Extract this ZIP into a separate folder OUTSIDE your existing project.
3. Double-click `APPLY_UPDATE.cmd`. Paste the existing folder path containing package.json, for example:
   `C:\Users\Jerry096\Documents\MY PROJECTS\LCPS_LMS_Vercel_Ready`
4. The helper copies only the files listed in UPDATED_FILES.json. It first backs up the previous versions into the sibling `LCPS_LMS_source_backups` folder. It does not replace `.env` files, databases, uploads, `.git`, or dependencies.
5. Open a terminal in your EXISTING project. Use Node.js 24 (as before). No new production dependencies were added. If dependencies are missing, run `npm.cmd ci`.
6. This update adds co-teacher/profile/actor columns, timetable activities and conflict guards. Apply the additive schema migration before starting:
   - Local SQLite: `npm.cmd run db:migrate`
   - Remote Turso: first create and verify a provider snapshot, then run `npm.cmd run db:migrate -- --remote-backup-confirmed`
   Use the existing environment values; do not create a new database or run first-time setup.
7. Run `npm.cmd run build`, then `npm.cmd run start`. Check your existing login and the features below on the local link before pushing to GitHub/Vercel.

The runtime also detects additive schema changes on first access. Do not rely on this instead of taking the database backup. The local SQLite migration creates a pre-schema snapshot when it changes an existing database. A source rollback alone does not undo a database migration.

Existing passwords are not reset by this update. New accounts and accounts explicitly reset by an administrator still need to change their temporary password once. The Remember option retains the username; your browser can supply a saved password, but you must click Sign in. Logging out invalidates the current session.

## Where to use the new features

- Second teacher: Academic setup → teaching/subject assignments → Second teacher (optional). Leave blank for one teacher. Both teachers must belong to the subject's department; schedule conflicts are rejected.
- Logo and social account labels: Admin → System settings. The logo is shared by login, portal and browser icon. Reload another open tab to pick up a changed logo.
- Bulk student accounts: User management / Department accounts → Bulk import students. Choose the correct department/program/session/class, download the CSV template, fill it, upload, validate the preview, and create accounts. Download the created-account credentials before leaving the page.
- CSV columns: name, username, identifier (roll number), email, phone, password. Blank passwords receive unique temporary passwords. Up to 500 rows per file, saved in groups of 10. Students are enrolled in the selected class's active subjects. Existing users are not overwritten. If the network fails, inspect saved users and download credentials before retrying; use the remaining rows only.
- Timetable: select department/session/class → Add break / library activity. Delete entry removes just that class/activity. Existing attendance/results are not deleted.
- My profile: bio, qualifications, HTTPS links and photo note. Click a profile picture to enlarge it.

See CHANGELOG_16_POINTS.md for every requested point and VERIFICATION.md for checks and limitations.
