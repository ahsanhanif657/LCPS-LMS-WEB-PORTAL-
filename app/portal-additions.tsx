'use client';
import { useState } from 'react';
import { Data, Row } from '@/lib/lms/types';
import { permitted } from '@/security/privileges';
import { defaultCoursePolicy } from '@/lib/lms/course-policy';
type Run = (b: Row, m?: string) => Promise<any>;
export function CoursePolicy({
  data,
  user,
  offeringId,
  run,
}: {
  data: Data;
  user: Row;
  offeringId: string;
  run: Run;
}) {
  const saved = data.coursePolicies?.find((r) => r.offeringId === offeringId),
    subject = data.subjects.find(
      (item) => item.id === data.offerings.find((item) => item.id === offeringId)?.subjectId,
    ),
    hasLab = subject?.subjectType !== 'Lab' && !!subject?.hasLab,
    sourcePolicy = saved ? JSON.parse(saved.policy) : defaultCoursePolicy,
    theoryKeys = ['assignment', 'quiz', 'attendance', 'participation', 'midterm', 'final'],
    theoryTotal = theoryKeys.reduce((sum, key) => sum + Number(sourcePolicy[key] || 0), 0),
    policy =
      hasLab && sourcePolicy.lab !== 20
        ? Object.fromEntries([
            ...theoryKeys.map((key) => [
              key,
              (Number(sourcePolicy[key] || 0) * 80) / (theoryTotal || 100),
            ]),
            ['lab', 20],
            ['methods', sourcePolicy.methods],
          ])
        : !hasLab && sourcePolicy.lab === 20 && theoryTotal > 0
          ? Object.fromEntries([
              ...theoryKeys.map((key) => [
                key,
                (Number(sourcePolicy[key] || 0) * 100) / (theoryTotal || 1),
              ]),
              ['lab', 0],
              ['methods', sourcePolicy.methods],
            ])
          : { ...sourcePolicy, lab: hasLab ? 20 : 0 };
  const [draft, setDraft] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const rows = [
    ['assignment', 'Assignment', 'quiz', 'Quiz'],
    ['attendance', 'Attendance', 'participation', 'Participation / Presentation'],
    ['midterm', 'Mid Term', 'final', 'Final'],
  ];
  if (subject?.subjectType === 'Lab')
    return (
      <section className="course-policy">
        <h2>Assessment policy</h2>
        <p>
          Lab-only subject: the practical assessment is marked out of 20. Theory components do not
          apply.
        </p>
      </section>
    );
  return (
    <section className="course-policy">
      <h2>Assessment policy</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Assessment</th>
              <th>Weight</th>
              <th>Assessment</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {[0, 2].map((i) => (
                  <PolicyCell
                    key={row[i]}
                    name={row[i + 1]}
                    value={(draft || policy)[row[i]]}
                    editing={!!draft}
                    onChange={(value) => setDraft({ ...draft, [row[i]]: value })}
                  />
                ))}
              </tr>
            ))}
            {hasLab && (
              <tr>
                <PolicyCell name="Lab" value={20} editing={false} onChange={() => {}} />
                <td colSpan={2}>Practical assessment · marks out of 20</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3>Assessment methods</h3>
      {draft ? (
        <label className="field">
          <span>Methods</span>
          <textarea
            value={draft.methods}
            maxLength={2000}
            onChange={(e) => setDraft({ ...draft, methods: e.target.value })}
          />
        </label>
      ) : (
        <p>{policy.methods}</p>
      )}
      {['ADMIN', 'HOD'].includes(user.role) && (
        <div className="row gap">
          {draft ? (
            <>
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await run({ action: 'coursePolicySave', offeringId, policy: draft });
                    setDraft(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save policy
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setError('');
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setDraft({ ...policy })}>
              Edit assessment policy
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
function PolicyCell({
  name,
  value,
  editing,
  onChange,
}: {
  name: string;
  value: number;
  editing: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <>
      <th>{name}</th>
      <td>
        {editing ? (
          <input
            aria-label={name + ' percentage'}
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        ) : (
          value + '%'
        )}
      </td>
    </>
  );
}
const labels: Record<string, string> = {
  finance: 'Finance & accounts',
  exams: 'Campus examinations',
  events: 'Events',
  transport: 'Transport',
  diary: 'Personal diary',
  todo: 'To-do list',
};
export function RecordWorkspace({
  data,
  user,
  run,
  personal = false,
}: {
  data: Data;
  user: Row;
  run: Run;
  personal?: boolean;
}) {
  const kinds = personal
    ? ['diary', 'todo']
    : ['finance', 'exams', 'events', 'transport'].filter((k) => permitted(user, k));
  const [kind, setKind] = useState(kinds[0] || ''),
    [draft, setDraft] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const current = kinds.includes(kind) ? kind : kinds[0],
    records = (data[personal ? 'personalEntries' : 'managementRecords'] || [])
      .filter((r) => r.kind === current)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  async function perform(b: Row) {
    setBusy(true);
    setError('');
    try {
      await run(b);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel operations-panel">
      <h1>{personal ? 'My diary & to-do' : 'Management'}</h1>
      <p>
        {personal
          ? 'Your personal entries are visible only in your own account.'
          : 'Manage campus records within your assigned responsibilities.'}
      </p>
      <div className="row gap">
        {kinds.map((k) => (
          <button
            className={'btn ' + (k === current ? 'primary' : '')}
            key={k}
            disabled={busy}
            onClick={() => {
              setKind(k);
              setDraft(null);
              setError('');
            }}
          >
            {labels[k]}
          </button>
        ))}
      </div>
      <h2>{labels[current]}</h2>
      {!draft && (
        <button
          className="btn primary"
          onClick={() =>
            setDraft({
              kind: current,
              title: '',
              body: '',
              status: personal ? 'Pending' : 'Planned',
              amount: '',
              eventDate: '',
              dueDate: '',
            })
          }
        >
          Add {personal ? 'entry' : 'record'}
        </button>
      )}
      {draft && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            perform({ ...draft, action: personal ? 'personalSave' : 'managementSave' });
          }}
        >
          <label className="field">
            <span>Title</span>
            <input
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{personal ? 'Date / due date' : 'Date'}</span>
            <input
              type="date"
              value={draft[personal ? 'dueDate' : 'eventDate'] || ''}
              onChange={(e) =>
                setDraft({ ...draft, [personal ? 'dueDate' : 'eventDate']: e.target.value })
              }
            />
          </label>
          <label className="field span-two">
            <span>{personal ? 'Notes' : 'Details / reference'}</span>
            <textarea
              rows={5}
              required={!personal}
              maxLength={personal ? 20000 : 10000}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          {current === 'finance' && (
            <label className="field">
              <span>Amount (PKR)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.amount ?? ''}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </label>
          )}
          {current !== 'diary' && (
            <label className="field">
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {(personal
                  ? ['Pending', 'Done']
                  : ['Planned', 'In progress', 'Completed', 'Cancelled']
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          <div className="row gap span-two">
            <button className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {records.map((r) => (
        <article className="personal-record" key={r.id}>
          <h3>{r.title}</h3>
          <small>
            {r.dueDate || r.eventDate || r.createdAt.slice(0, 10)}
            {current !== 'diary' && ' · ' + r.status}
            {r.amount != null && ' · PKR ' + Number(r.amount).toLocaleString()}
          </small>
          <p style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p>
          <div className="row gap">
            <button className="btn" disabled={busy} onClick={() => setDraft({ ...r })}>
              Edit
            </button>
            {current === 'todo' && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  perform({
                    ...r,
                    action: 'personalSave',
                    status: r.status === 'Done' ? 'Pending' : 'Done',
                  })
                }
              >
                {r.status === 'Done' ? 'Mark pending' : 'Mark done'}
              </button>
            )}
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Delete this ' + (personal ? 'personal entry' : 'management record') + '?',
                  )
                )
                  perform({ action: personal ? 'personalDelete' : 'managementDelete', id: r.id });
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {!records.length && !draft && <p>No entries yet.</p>}
    </section>
  );
}
const social = [
  ['LCPS Facebook page', 'https://www.facebook.com/share/18B4Y3ipVW/', 'facebook'],
  ['LCPS Facebook community', 'https://www.facebook.com/share/1CFtSajHbz/', 'facebook'],
  ['lcps.lihs.official', 'https://www.instagram.com/lcps.lihs.official/', 'instagram'],
  ['lcps780', 'https://www.tiktok.com/@lcps780', 'tiktok'],
  [
    'Lahore College Of Pharmaceutical Sciences',
    'https://whatsapp.com/channel/0029Vb8cVGI6xCSYRgUrvJ1l',
    'whatsapp',
  ],
];
const socialPlatforms: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
};
function SocialIcon({ brand }: { brand: string }) {
  return (
    <svg className="social-brand" viewBox="0 0 24 24" aria-hidden="true">
      {brand === 'facebook' ? (
        <>
          <circle cx="12" cy="12" r="12" fill="currentColor" />
          <path
            fill="#fff"
            d="M13.6 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.4-.1-2.6-.1-2.6 0-4.3 1.6-4.3 4.4V10H7v3h3v8z"
          />
        </>
      ) : brand === 'instagram' ? (
        <>
          <rect
            x="2.5"
            y="2.5"
            width="19"
            height="19"
            rx="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <circle cx="18" cy="6.3" r="1.3" fill="currentColor" />
        </>
      ) : brand === 'tiktok' ? (
        <>
          <path
            d="M14 2h3c.2 3 1.8 4.8 5 5v3.2a10 10 0 0 1-5-1.6v7.1a6.6 6.6 0 1 1-6.6-6.6c.5 0 1 .1 1.5.2v3.5a3.3 3.3 0 1 0 1.9 3V2z"
            fill="#25f4ee"
            transform="translate(-1 1)"
          />
          <path
            d="M14 2h3c.2 3 1.8 4.8 5 5v3.2a10 10 0 0 1-5-1.6v7.1a6.6 6.6 0 1 1-6.6-6.6c.5 0 1 .1 1.5.2v3.5a3.3 3.3 0 1 0 1.9 3V2z"
            fill="#fe2c55"
            transform="translate(1 -.5)"
          />
          <path
            d="M14 2h3c.2 3 1.8 4.8 5 5v3.2a10 10 0 0 1-5-1.6v7.1a6.6 6.6 0 1 1-6.6-6.6c.5 0 1 .1 1.5.2v3.5a3.3 3.3 0 1 0 1.9 3V2z"
            fill="currentColor"
          />
        </>
      ) : (
        <>
          <path
            d="M12 1.5a10.3 10.3 0 0 0-8.8 15.7L2 22l5-1.3A10.5 10.5 0 1 0 12 1.5z"
            fill="currentColor"
          />
          <path
            d="M8.2 6.7c-.3-.7-.6-.7-.9-.7h-.8c-.3 0-.8.1-1.2.6s-1.6 1.6-1.6 3.8 1.6 4.4 1.8 4.7 3.1 5 7.7 6.8c3.8 1.5 4.6 1.2 5.4 1.1s2.5-1 2.9-2 .4-1.9.3-2.1-.4-.3-.8-.5l-2.8-1.3c-.4-.2-.7-.3-1 .2s-1.1 1.3-1.4 1.6-.5.3-.9.1a11.5 11.5 0 0 1-3.4-2.1 12.7 12.7 0 0 1-2.4-3c-.3-.5 0-.7.2-.9l.7-.8c.2-.3.3-.5.5-.8.1-.3 0-.6 0-.8z"
            fill="#fff"
            transform="translate(2 1) scale(.83)"
          />
        </>
      )}
    </svg>
  );
}
export function CommunityBanner({ data }: { data: Data }) {
  const notices = data.announcements
    .filter((a) =>
      data.users.some(
        (u) =>
          u.id === a.authorId &&
          ['TREASURER', 'EXAMINATION_CONTROLLER', 'REGISTRAR'].includes(u.role),
      ),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  return (
    <section className="community-banner">
      <div>
        <small>LAHORE COLLEGE OF PHARMACEUTICAL SCIENCES</small>
        <h2>Stay connected with LCPS</h2>
        <div className="social-links">
          {social.map(([label, href, brand], index) => {
            const username = data.socialAccounts?.[index]?.name || label,
              platform = socialPlatforms[brand] || brand;
            return (
              <a
                className={'social-account ' + brand}
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${platform}: ${username}`}
              >
                <span className="social-icon-frame">
                  <SocialIcon brand={brand} />
                </span>
                <span className="social-username">{username}</span>
                <span className="social-platform">{platform}</span>
              </a>
            );
          })}
        </div>
      </div>
      <div className="management-notices">
        <h3>Management announcements</h3>
        {notices.length ? (
          notices.map((a) => (
            <article key={a.id}>
              <strong>{a.title}</strong>
              <p>{a.body}</p>
              <small>
                {data.users.find((u) => u.id === a.authorId)?.role.replaceAll('_', ' ')}
              </small>
            </article>
          ))
        ) : (
          <p>No management announcements at present.</p>
        )}
      </div>
    </section>
  );
}

export function SocialAccountSettings({
  data,
  run,
}: {
  data: Data;
  run: (body: Row, message?: string) => Promise<any>;
}) {
  const [names, setNames] = useState(social.map((r, i) => data.socialAccounts?.[i]?.name || r[0])),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="panel settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await run({ action: 'socialAccountNames', names }, 'Social account names updated');
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Social account usernames</h3>
      <p>
        These names appear below each platform icon. Use the exact username or display name shown on
        the linked account.
      </p>
      {social.map(([label, href, brand], i) => (
        <label className="field" key={href}>
          <span>
            {socialPlatforms[brand] || brand} ·{' '}
            <a href={href} target="_blank" rel="noreferrer">
              Open account
            </a>
          </span>
          <input
            aria-label={`${socialPlatforms[brand] || brand} username or display name`}
            required
            maxLength={100}
            value={names[i]}
            onChange={(e) => setNames(names.map((v, j) => (j === i ? e.target.value : v)))}
          />
        </label>
      ))}
      <button className="btn primary" disabled={busy}>
        Save usernames
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
