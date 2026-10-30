# Requested changes — 16-point checklist

1. **Subject appearance:** Shared dashboard-style blue subject cards in subject browsing, resource selection, attendance selection, outlines, academic hierarchy and teacher subject browsing. They show course code/name, credits, class, teacher(s), timetable and enrollment information when available. Compact form dropdowns and data-table cells remain controls rather than cards.
2. **Password / Remember:** Removed the legacy password-policy-version check that repeatedly forced established accounts to change passwords. Only the explicit new/reset-password flag gates access. Remember my username and browser password autofill require a deliberate Sign in. Passwords are not stored in localStorage.
3. **Announcement deletion:** Creator can delete their own; admin can delete any; HOD can delete announcements belonging to their department, including subject/class-targeted announcements. HOD cannot delete another department's or a campus-wide announcement they did not create.
4. **College logo:** Supplied white LCPS logo used on login and portal, with a visible dark backing, and a shared browser icon endpoint. Browser tab title remains readable text; a logo cannot replace the literal web address.
5. **Two teachers:** Optional second teacher per subject/class offering. Both receive teaching access, including attendance, coursework and results. Actual operators are recorded and displayed for attendance, coursework, results, grading and timetable updates. Existing historical records without an operator are not assigned a fabricated name.
6. **Admin logo control:** Admin-only image upload in settings. Server authorization prevents other roles from changing it. PNG/JPG/WebP up to 512 KB; shared across login, portal and browser icon.
7. **Building visibility:** Smaller login form with a contained campus image; mobile stacks the campus area above the form so the building is not cropped by a full-screen cover image.
8. **Responsive changes:** New cards, profile dialog, settings, import preview and activity editor use responsive layouts; wide academic tables scroll within their containers. Existing design and architecture retained. See current visual verification limitation below.
9. **Password toggle:** Show/Hide text on password fields, including login; no eye icon required.
10. **Social accounts:** Platform brand icons with account labels underneath and clickable links. Instagram uses lcps.lihs.official; TikTok uses lcps780. The two supplied Facebook share URLs do not reveal verified page titles, so their generic LCPS labels can be corrected in admin settings. Exact Facebook titles have not been independently verified.
11. **Break/library timetable:** Separate Break, Library assignment and Other activity entries, with class/day/time/optional room. Included in the same timetable grid and exported timetable. Conflict checks protect existing class/room slots.
12. **Delete one timetable class:** Delete entry controls for authorized HOD/timetable-incharge/admin users. Confirmation and server-side permissions; only the selected entry is removed.
13. **Full profile photo:** Clickable user photos open a full-size dialog with close/backdrop/Escape support.
14. **Richer profiles:** Own bio, qualifications, safe HTTPS links and a short note attached to the photo. Public profile view excludes private phone/password data.
15. **Powered by A & U:** Subtle login/footer credit and generated report/timetable HTML, PDF/print, Word, ZIP/CSV/JPG paths, plus bulk-import template/credentials. Existing uploaded third-party documents are served unchanged and are not rewritten.
16. **Bulk student creation:** UTF-8 CSV template, preview, duplicate and permission validation, up to 500 students/file, batches of 10, automatic selected-class enrollment and credentials download. 105 accounts tested against an isolated database.

## Preserved behavior

Existing accounts/password hashes and uploaded documents are not replaced. Earlier role controls, attendance statuses/roll sorting/remarks, results input borders, assessment policy, subject/session hierarchy, diary/tasks, management features and timetable grid exports remain in the source. Source comparison and automated regressions were used; this is not a claim that every production data combination has been exercised.

## Verification limits

No live production database or Vercel deployment was modified. Final browser-rendered mobile screenshot testing was blocked by this session's browser runtime; responsive CSS and component interaction checks were completed, but a visual check on your actual phones is still needed before presenting. PostgreSQL import support was updated for the new columns/table; no live PostgreSQL migration was performed. Current runtime remains SQLite/Turso.
