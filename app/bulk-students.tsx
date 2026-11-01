'use client';
import { useState } from 'react';
import { Data, Row } from '@/lib/lms/types';
import { parseStudentCsv, studentImportHeaders } from '@/lib/lms/student-csv';
import { reportCsv } from '@/lib/lms/export';
const saveCsv = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const request = async (body: Row) => {
  const r = await fetch('/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Import failed.');
  return j.result;
};
export function BulkStudents({
  data,
  user,
  refresh,
}: {
  data: Data;
  user: Row;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [batch, setBatch] = useState(''),
    [rows, setRows] = useState<Row[]>([]),
    [validated, setValidated] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [done, setDone] = useState(0);
  const batches = data.batches.filter(
    (b) =>
      b.active &&
      (['ADMIN', 'PRINCIPAL'].includes(user.role) || b.departmentId === user.departmentId),
  );
  return (
    <section className="bulk-students panel">
      <button className="btn" onClick={() => setOpen(!open)}>
        Bulk import students
      </button>
      {open && (
        <>
          <h3>Create accounts from a CSV</h3>
          <p>
            Select a class, download the template, then save your Excel sheet as CSV UTF-8. Up to
            500 students per file. Accounts are enrolled in the class’s active subjects. Existing
            accounts are never overwritten.
          </p>
          <div className="row gap">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                saveCsv(reportCsv(studentImportHeaders, []), 'LCPS-student-import-template.csv')
              }
            >
              Download CSV template
            </button>
            <label className="field">
              <span>Department / program / session / class</span>
              <select
                value={batch}
                disabled={busy || done > 0}
                onChange={(e) => {
                  setBatch(e.target.value);
                  setValidated(false);
                }}
              >
                <option value="">Select class</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {data.departments.find((d) => d.id === b.departmentId)?.name} ·{' '}
                    {data.programs.find((p) => p.id === b.programId)?.name} ·{' '}
                    {data.sessions.find((s) => s.id === b.sessionId)?.name} · {b.name} · Semester{' '}
                    {b.semester}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>CSV file</span>
              <input
                disabled={busy}
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setMessage('');
                  setRows([]);
                  setDone(0);
                  setValidated(false);
                  try {
                    if (file.size > 400000) throw new Error('CSV must be under 400 KB.');
                    setRows(
                      parseStudentCsv(await file.text()).map((r) => ({
                        ...r,
                        password:
                          r.password ||
                          'Lc!' +
                            Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) =>
                              n.toString(16).padStart(2, '0'),
                            ).join(''),
                      })),
                    );
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
          {rows.length > 0 && (
            <>
              <p>
                {rows.length} students loaded · {done} saved. Blank passwords receive a unique
                temporary password. New students change it on first login.
              </p>
              <div className="table-wrap import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Roll number</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{r.name}</td>
                        <td>{r.username}</td>
                        <td>{r.identifier}</td>
                        <td>{i < done ? 'Created' : 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row gap">
                <button
                  className="btn"
                  disabled={!batch || busy || done > 0}
                  onClick={async () => {
                    setBusy(true);
                    setMessage('');
                    try {
                      const result = await request({
                        action: 'validateStudentImport',
                        batchId: batch,
                        rows,
                      });
                      setValidated(result.valid);
                      setMessage(
                        result.valid
                          ? 'Validation passed. Review the preview, then create accounts.'
                          : result.errors.join('\n'),
                      );
                    } catch (e) {
                      setMessage((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Validate preview
                </button>
                <button
                  className="btn primary"
                  disabled={!validated || busy || done === rows.length}
                  onClick={async () => {
                    setBusy(true);
                    setMessage('');
                    let count = done;
                    try {
                      for (let i = done; i < rows.length; i += 10) {
                        const result = await request({
                          action: 'importStudents',
                          batchId: batch,
                          rows: rows.slice(i, i + 10),
                        });
                        if (!result.valid) throw new Error(result.errors.join('\n'));
                        count += result.created.length;
                        setDone(count);
                      }
                      setMessage(`${count} student accounts created and enrolled.`);
                    } catch (e) {
                      setMessage(
                        `${count} accounts saved. ${(e as Error).message} Download credentials for saved rows before leaving. If the network response was lost, check accounts before retrying.`,
                      );
                    } finally {
                      setBusy(false);
                      await refresh();
                    }
                  }}
                >
                  {busy
                    ? 'Processing…'
                    : done
                      ? 'Continue remaining rows'
                      : 'Create student accounts'}
                </button>
                {done > 0 && (
                  <button
                    className="btn"
                    onClick={() =>
                      saveCsv(
                        reportCsv(
                          ['Name', 'Username', 'Roll number', 'Temporary password', 'Powered by'],
                          rows
                            .slice(0, done)
                            .map((r) => [r.name, r.username, r.identifier, r.password, 'A & U']),
                        ),
                        'LCPS-student-credentials.csv',
                      )
                    }
                  >
                    Download created-account credentials
                  </button>
                )}
              </div>
              <p className="muted">
                Download the credentials before leaving. Keep the file private and share each
                student’s own details individually. Powered by A &amp; U
              </p>
            </>
          )}
          {message && (
            <p role="status" className="preserve">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
