# LCPS LMS — Login and Academic Views Update

## Apply to your EXISTING project (recommended)

1. Stop the running portal with Ctrl+C. Keep a copy of your database and uploaded files.
2. Extract this ZIP into a NEW folder outside your existing project.
3. In the extracted folder, double-click APPLY_UPDATE.cmd.
4. Paste the full path of your EXISTING project folder (the folder containing package.json).
5. The helper backs up replaced source files in a sibling LCPS_LMS_source_backups folder, then copies ONLY the files in UPDATED_FILES.json.
6. Open the EXISTING project in VS Code. In its terminal run:

```bat
npm.cmd run db:migrate
npm.cmd run dev -- --webpack
```

Open http://localhost:3000. Use your EXISTING login. Do not initialize /setup again.

For a production build, stop the development server, then run:

```bat
npm.cmd run build
npm.cmd run start
```

Node.js 24.x is required. No new dependencies were added. If dependencies are absent, run npm.cmd install first.

### Remote Turso deployment
The migration command requires a verified provider backup before remote migration. After making that backup, run `npm.cmd run db:migrate -- --remote-backup-confirmed`, then build and deploy with your existing environment settings. This update does not change your storage provider or deploy your site automatically.

## Preserving your data
This ZIP contains application source, not your live database, uploaded documents, environment secrets, node_modules, .next or old .bak files. The update helper does not overwrite any of them. Do not replace your entire existing folder with this extracted folder. Qualifications are added with an idempotent nullable database column; accounts and attendance history are retained. Old backups gain a null qualifications field during restore.

## What changed
1. Campus-photo split-screen login and first-administrator setup using the existing LCPS logo; responsive layout.
2. Overall attendance statistic removed from every dashboard. Subject attendance summaries remain.
3. Course outlines sidebar module and subject-detail shortcut. Students see enrolled subjects; teachers see assigned subjects; HODs browse session → subject → outline within their department. Admin and principal can browse authorized sessions. Outlines are stored as course-linked materials with type Course outline, with existing authenticated file access.
4. Teachers/HODs edit qualifications in My profile. Subject details show teacher photo/name, course code and View teacher profile. Public teacher profiles omit private phone numbers and permissions.
5. Shared timetable tables across portals, hierarchies and teacher directory; uploaded schedule documents remain separately available as reference files.
6. Structured login notices with category, title, content, due date and action. Existing once-per-login acknowledgement remains.
7. Task label changed to Assigned Tasks for teachers. HOD Teachers Task remains.
8. HOD department subjects start with session selection, retaining existing activity tabs.
9. Attendance percentage in HOD/principal student lists, plus shared percentage, counted classes, present/absent, late/excused cards in student detail views.
10. HOD bulk result entry starts with session, then subject, then student marks roster; department result permissions retained.
11. Report actions open a common menu: View online, PDF, JPG, Word and ZIP/CSV. PDF uses the browser print dialog (choose Save as PDF); Word is the existing HTML-compatible .doc format. Long JPG reports use numbered pages, with repeated headers. Downloaded original attachments remain in their original format; Office documents without browser preview must be downloaded.
12. Reports are read-only; assigned teachers cannot be deleted through reports. Academic setup account/assignment management retains existing permissions.

## Course-outline permissions
Admin Role Privileges includes View courseOutlines (read access). Publish learning materials controls outline creation/editing, together with the new outline view permission and existing teaching scope. Teachers can publish only their assigned subject outlines. HODs can read departmental outlines but retain their existing own-teaching write scope. No new cross-department permissions are granted.

To publish: Course outlines → select session if applicable → select subject → Add course outline. Supply a title, HTTPS URL or file, and keep Resource type as Course outline.

## Verification
See VERIFICATION.md. No live deployment was performed.
