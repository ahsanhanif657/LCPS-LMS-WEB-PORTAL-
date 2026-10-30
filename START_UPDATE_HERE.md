# LCPS LMS — Professional Blue Update

Base: LCPS_LMS_Vercel_Ready(20261030-045127).zip. All 14 requested changes are included. Your blue-theme instruction takes precedence over the earlier green suggestion.

## Apply
1. Stop your running server (Ctrl+C).
2. Extract this ZIP OUTSIDE the existing project folder.
3. Double-click APPLY_UPDATE.cmd and paste the existing project path:
   C:\Users\Jerry096\Documents\MY PROJECTS\LCPS_LMS_Vercel_Ready
4. The helper creates a source backup in the sibling LCPS_LMS_source_backups folder, then copies the changed files.
5. In your EXISTING project terminal run `npm.cmd run build`.
6. After successful build run `npm.cmd run start`; open http://localhost:3000.
7. Check locally, then commit/push through your usual deployment workflow.

No database migration or new dependencies are required. Existing accounts, passwords, permissions, environment configuration, database and uploads are preserved.

## All 14 changes
1. White/light-grey background with clearly selected controls; final accent is blue as requested in point 8.
2. Consistent dashboard cards, soft shadows, rounded corners and relevant icons.
3. Highlighted sidebar selection and improved alignment/spacing.
4. Readable fonts, prominent headings and balanced spacing.
5. Clear table headers, alternating rows and coloured Present/Absent/Late badges.
6. Consistent Save/Edit/Delete/Back styles, subtle hover and keyboard focus; reduced-motion support.
7. Mobile cards, comfortable controls, compact header and contained scrolling for large tables.
8. Azure/cerulean accents, pale-blue highlights and navy navigation matching LCPS branding.
9. Attendance/resource subject cards share dashboard artwork, typography and sizing, replacing oversized plain book tiles.
10. Attendance names/roll numbers are larger and dark; results text and marks input borders are readable too.
11. Timetable days are bold and centred; time slots appear clearly in the top row. Mobile timetable has sticky day labels.
12. Online timetable and PDF/Word/JPG/ZIP exports preserve day-by-time boxes with subject, teacher and room. Each class has a separate grid.
13. Supplied LCPS logo used on login and sidebar. Campus-photo login composition retained with blue accents and readable glass form.
14. Only sidebar navigation icons removed; labels larger and bold. Menu, close, bell, edit/delete and subject icons retained.

## Download timetable
Download timetable → Download PDF opens the browser print window: choose Save as PDF. Landscape A4 is requested. Word is an HTML-compatible .doc; JPG is a boxed grid; ZIP contains timetable.html. Very long schedules can span multiple pages. Exports use the selected class/subject scope and existing report permission.

Teacher marking still requires an active assigned class and attendance permission. This visual update does not change role privileges or reset passwords.
