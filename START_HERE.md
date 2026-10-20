# LCPS LMS — SQLite/Turso setup

Is project ko chalane ke liye PostgreSQL ya Docker install karna zaroori nahin. App SQLite/Turso use karti hai.

## Is computer par pehle se mojood data

Local environment `TURSO_DATABASE_URL=file:./lcps-local.db` par point karta hai. Is database mein pehle se accounts, password hashes, attendance, file records aur private database file objects hain. Uploaded local files `.local-files/` mein hain. Dono locations ko preserve karein; inhen delete, overwrite, ya ZIP mein share na karein. SQLite backup banane se pehle schema mein zaroori tabdeeli nahin hoti; schema update ki zaroorat ho to migration command pehle private snapshot banati hai.

## Existing local database ke saath app chalana

1. Node.js 24 aur project dependencies (`npm ci`) use karein.
2. `.env.local` mein existing `TURSO_DATABASE_URL=file:./lcps-local.db` ko waisa hi rehne dein. `FILE_STORAGE_MODE=local` local profile/course files ko `.local-files/` se serve karta hai.
3. `npm run db:migrate` current SQLite database ki schema check/update karega. Existing user records nahin seed karta/reset karta aur populated local file ko update se pehle private snapshot mein preserve karta.
4. `npm run dev` chala kar apne existing administrator username/password se login karein. Agar login fail ho to database ya password reset na karein; mujhe exact error batayein.

## Remote Turso (sirf jab cloud deployment darkar ho)

Turso dashboard se existing database select karke uska database URL aur auth token `.env.local`/deployment environment mein `TURSO_DATABASE_URL` aur `TURSO_AUTH_TOKEN` ke naam se set karein. Local database aur remote Turso alag stores hain—pehle check karein ke kis mein latest records hain. Data import/export se pehle provider ka verified backup banayein. Existing local records automatically cloud mein copy nahin hote.

Vercel par local `.db` file persistent database nahin hoti; wahan remote Turso/libSQL istemal karein. Private Blob files ke liye `FILE_STORAGE_MODE=blob` aur `BLOB_READ_WRITE_TOKEN` configure karein. Local uploads `.local-files/` mein rehti hain aur deploy ke saath upload nahin hotin.

## Verify aur troubleshoot

- `npm run db:migrate`: SQLite schema migration/check.
- `npm run check`: TypeScript aur test suite.
- `TURSO_DATABASE_URL` missing: `.env.local` mein URL set karein; local example `file:./lcps-local.db` hai.
- Login error: confirm karein app usi SQLite file/Turso instance se connect ho rahi hai jahan account maujood hai. Passwords database mein hashes ki surat mein hain; unhen edit/delete na karein.

PostgreSQL migration scripts optional hain, aur SQLite/Turso istemal karne ke liye unki zaroorat nahin. Koi data migration tab tak na chalayein jab tak source, target aur verified backup confirm na hon.
