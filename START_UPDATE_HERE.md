# LCPS LMS — role actions and responsive interface update

Base: your uploaded `LCPS_LMS_Vercel_Ready(20261029-215850).zip`.
This release changes role-action discoverability, essential buttons/icons and mobile layout. The existing dashboard design, architecture, academic data model and password policy are retained. It does not reintroduce the previous department/program dashboard update that you chose to undo.

## Apply to your existing project

1. Stop the running server with Ctrl+C.
2. Extract this ZIP into a separate folder OUTSIDE your existing project.
3. Double-click `APPLY_UPDATE.cmd`. Paste the existing project folder path (the folder containing package.json).
4. The helper backs up replaced source files to the sibling `LCPS_LMS_source_backups` folder before copying the changed files. It leaves your environment configuration, databases, uploads, Git history and installed dependencies alone.
5. In the EXISTING project terminal, run:

```powershell
npm.cmd run build
```

After the build succeeds:

```powershell
npm.cmd run start
```

Open http://localhost:3000. Development alternative: `npm.cmd run dev -- --webpack`.
No database migration or dependency change is required for this release when applied to the uploaded baseline. No account passwords are reset by this update. If dependencies have not been installed on a new machine, use Node 24 and run `npm.cmd ci` first.

## What changed

- Teacher Attendance opens with an obvious **Mark attendance** tab and an assigned-class selector, alongside **View attendance records**. Marking is available for active classes assigned to that teacher.
- HOD Attendance includes **Mark attendance** for their own teaching classes and **Department records** for session/subject review. Existing department and teaching boundaries remain enforced.
- If marking permission is explicitly denied, the page explains why. Administrators can inspect Roles & permissions → Record / correct attendance and View attendance, plus the individual user's overrides. This patch does not silently erase your configured access restrictions. A teacher also needs an active Teaching assignment and enrolled students.
- Fixed duplicated attendance table headings, date-view loading, and the attendance save error that previously prevented retry. Added a clear Edit attendance action on review.
- Mobile attendance uses one student card per row with visible status and late-remarks fields. Desktop keeps the register table.
- Restored sidebar module icons, active navigation chevrons, the announcement bell, back/next pagination arrows, edit/close icons and mobile drawer close control. Profile initials are visible on mobile even without a profile photo.
- Improved labels including Sign in, Roles & permissions, Faculty tasks, Create account, Export records, Add scheduled class and Save attendance.
- Fixed add/edit dialogs in HTTP LAN previews where browser randomUUID is unavailable. Server-generated persistent IDs are unchanged.
- Responsive cards, readable mobile type, usable touch targets, wrapped long text, contained horizontal table scrolling, mobile dialogs and navigation. The third dashboard subject card is no longer hidden on phones.

## Check on your installation

1. Teacher: Attendance → subject/class → mark Present/Absent/Late → enter late remarks → Review attendance → Save attendance.
2. HOD: mark own assigned class, then switch to Department records and select a session/subject.
3. Student: view subject attendance and resources; no marking or grading controls should appear.
4. Admin: create/edit an account, inspect roles/permissions and enter result marks.
5. Timetable incharge: session → class → Add scheduled class / Edit class.
6. Phone: open and close the sidebar, tap the bell/profile/signout, fill the attendance cards, open a dialog and scroll wide report tables within their panel.

If you need to undo this source update, retain the timestamped source backup and its restore-manifest.json. Restoring code does not undo database edits made while using the app.

See VERIFICATION.md for test coverage and its limits.
