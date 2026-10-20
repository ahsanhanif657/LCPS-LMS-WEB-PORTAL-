# Security controls actually used by the portal

This folder is imported by API routes, the service layer and Next.js configuration. Removing it breaks the protections/build; it is not a decorative folder or a guarantee against attacks.

| File | Enforced protection |
| --- | --- |
| passwords.ts | Salted PBKDF2-SHA256 password hashing (100,000 iterations); 10–128 character passwords; random session tokens |
| authorization.ts | Server-side role and record access rules |
| privileges.ts | Per-user action privileges, enforced by service operations |
| requests.ts | Same-origin mutation checks, JSON body bounds, constant-time setup-secret comparison, secure cookie settings |
| rate-limit.ts | Persistent database-backed authentication/setup/action rate limiting |
| headers.mjs | CSP, frame denial, MIME sniffing prevention, referrer/permissions policy and HSTS |
| errors.ts | Controlled application errors without exposing internal exception details |

Authentication uses opaque tokens with only hashes in the database. Production session cookies are Secure, HttpOnly and SameSite=Strict, with an eight-hour lifetime. Password changes revoke sessions. Setup requires a server secret and is one-time. No public signup or default login credentials are included.

Files are private and returned through authorization-checked API routes, with upload type/size validation. Database statements bind values; allowed resources/actions are validated by the service layer. Passwords, database tokens and Blob tokens must remain server-only; never prefix them with NEXT_PUBLIC_.

## Boundaries and operations

- CSP permits inline scripts/styles for current Next.js hydration; it does not provide nonce-based strict CSP. It denies framing and object embeds.
- Rate limits are application-level. Configure Vercel firewall/traffic controls for abuse and denial-of-service protection. Database rate limiting alone is not DDoS protection.
- No MFA, external penetration test, malware scanner or institutional compliance certification is included.
- Rotate provider credentials if leaked, promptly install reviewed security updates, retain protected off-site backups, and review audit records and staff privileges.
- Use HTTPS and private Blob storage. A public Blob store is not a substitute for private storage.
- Restrict access to deployment settings and the private source repository. Do not give teachers/students database or hosting credentials.
- Security bugs should be reported privately to the college's designated system administrator; do not include real student records or live secrets in public issues.

Check real deployment permissions and backup recovery before production rollout. Automated tests support confidence but cannot establish that a website is completely secure.
