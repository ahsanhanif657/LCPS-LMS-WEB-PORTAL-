# Verification — responsive role fixes

- Production build: Next.js webpack build, TypeScript checks and route generation.
- Automated suite: 96 integration checks, plus component-rendering, local/cloud storage configuration, export and PostgreSQL SQL-translation checks.
- New tests verify marking availability against teacher assignment, HOD own-class boundaries, inactive offerings and explicit access denial. They also verify the six-column attendance register, direct marking entry and browser form IDs without randomUUID.
- Browser coverage: full React portal with controlled fixture API responses, 8 roles × 3 widths (360, 768 and 1366 px). 258 page/width checks pass with no document horizontal overflow or mismatched table-column counts. Core role enforcement is tested separately against temporary SQLite by the integration suite.
- Browser interactions: teacher late remarks, failed-save retry, attendance date loading, logout, HOD own-class/department tabs, denied-access messaging, student assignment dialog/read-only attendance, admin account dialog/result-input borders, and delegated timetable editor.
- Screenshots were inspected internally for login, teacher dashboard/attendance and student dialogs. No real college data was used.
- Update helper is smoke-tested against the uploaded baseline: changed files match, the previous source is backed up outside the project, and environment/database/upload sentinel files are preserved.

Limitations: Browser API responses use fixtures, not your live Turso database. Integration storage tests use isolated SQLite and mocks. Real device Safari/Android keyboards and the college's individual permission settings should be checked on the target installation. No deployment, Git push, live account edit or live database migration was performed.
