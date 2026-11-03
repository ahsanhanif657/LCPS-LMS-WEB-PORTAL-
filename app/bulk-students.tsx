'use client';
import { useMemo, useState } from 'react';
import { Data, Row } from '@/lib/lms/types';
import {
  guessAccountImportMappings,
  ImportFileData,
  parseAccountImportFile,
} from '@/lib/lms/account-import-files';
import { reportCsv } from '@/lib/lms/export';
import { roles } from '@/lib/lms/types';
import { permitted } from '@/security/privileges';

const fields = [
  ['name', 'Full name', true],
  ['username', 'Username', true],
  ['role', 'Role', false],
  ['departmentId', 'Department', false],
  ['programId', 'Program', false],
  ['sessionId', 'Academic session', false],
  ['batchId', 'Class / batch', false],
  ['identifier', 'Student / employee ID', false],
  ['email', 'Email', false],
  ['phone', 'Phone', false],
  ['password', 'Password', false],
  ['employmentType', 'Teacher appointment', false],
] as const;

const request = async (body: Row) => {
  const response = await fetch('/api/lms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Import request failed.');
  return json.result;
};

function temporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `Lc!${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function saveCsv(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mappedRecords(file: ImportFileData, mapping: Record<string, string>, defaults: Row) {
  const columnIndex = (field: string) =>
    mapping[field] ? file.headers.indexOf(mapping[field]) : -1;
  return file.rows.map((row, index) => {
    const output: Row = { _rowNumber: index + 2 };
    for (const [field] of fields) {
      const position = columnIndex(field);
      if (position >= 0) output[field] = row[position] || '';
    }
    for (const key of [
      'role',
      'departmentId',
      'programId',
      'sessionId',
      'batchId',
      'employmentType',
    ])
      if (!output[key]) output[key] = defaults[key] || '';
    if (!output.password) output.password = temporaryPassword();
    return output;
  });
}

export function BulkStudents({
  data,
  user,
  refresh,
}: {
  data: Data;
  user: Row;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fileData, setFileData] = useState<ImportFileData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<Row[]>([]);
  const [outcomes, setOutcomes] = useState<Record<number, { status: string; errors: string[] }>>(
    {},
  );
  const [defaultRole, setDefaultRole] = useState('STUDENT');
  const [departmentId, setDepartmentId] = useState(
    user.role === 'HOD' ? String(user.departmentId || '') : '',
  );
  const [programId, setProgramId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [previewed, setPreviewed] = useState(false);
  const [created, setCreated] = useState(0);

  const canAssignSeniorRoles = permitted(user, 'senior_accounts');
  const availableRoles = canAssignSeniorRoles ? roles : ['STUDENT', 'TEACHER'];
  const departments = data.departments.filter(
    (department) => user.role !== 'HOD' || department.id === user.departmentId,
  );
  const programs = data.programs.filter(
    (program) =>
      program.active !== 0 &&
      (!departmentId || program.departmentId === departmentId) &&
      (user.role !== 'HOD' || program.departmentId === user.departmentId),
  );
  const batches = data.batches.filter(
    (batch) =>
      batch.active !== 0 &&
      (!departmentId || batch.departmentId === departmentId) &&
      (!programId || batch.programId === programId) &&
      (!sessionId || batch.sessionId === sessionId) &&
      (user.role !== 'HOD' || batch.departmentId === user.departmentId),
  );
  const defaultValues = useMemo(
    () => ({ role: defaultRole, departmentId, programId, sessionId, batchId, employmentType }),
    [defaultRole, departmentId, programId, sessionId, batchId, employmentType],
  );

  async function loadFile(file: File) {
    setMessage('');
    setFileData(null);
    setRecords([]);
    setOutcomes({});
    setPreviewed(false);
    setCreated(0);
    try {
      const parsed = await parseAccountImportFile(file);
      setFileData(parsed);
      setMapping(guessAccountImportMappings(parsed.headers));
      setRecords(mappedRecords(parsed, guessAccountImportMappings(parsed.headers), defaultValues));
      setMessage(
        `${parsed.rows.length} account rows loaded. Map columns, select defaults, and preview validation.`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  function prepareRecords() {
    if (!fileData) return [];
    if (!mapping.name || !mapping.username)
      throw new Error('Map both Full name and Username before validating the import.');
    const mappedColumns = Object.entries(mapping).filter(([, column]) => column);
    const duplicate = mappedColumns.find(
      ([, column], index) =>
        mappedColumns.findIndex(([, candidate]) => candidate === column) !== index,
    );
    if (duplicate) throw new Error('Each file column can map to only one account field.');
    const prepared = mappedRecords(fileData, mapping, defaultValues);
    setRecords(prepared);
    return prepared;
  }

  const validCount = Object.values(outcomes).filter((outcome) => outcome.status === 'Ready').length;
  const invalidCount = Object.values(outcomes).filter(
    (outcome) => outcome.status === 'Rejected',
  ).length;
  const createdRecords = records.filter(
    (row) => outcomes[Number(row._rowNumber)]?.status === 'Created',
  );

  return (
    <section className="bulk-students panel">
      <button className="btn" type="button" onClick={() => setOpen(!open)}>
        Bulk import accounts
      </button>
      {open && (
        <div className="account-import">
          <h3>Import users from CSV, Excel or PDF</h3>
          <p>
            Choose a file containing 1–500 accounts. CSV and Excel (.xlsx) sheets are supported. PDF
            import only accepts readable text tables; scanned or unclear PDFs are rejected. Existing
            accounts are not overwritten.
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy || created > 0}
            onClick={() =>
              saveCsv(
                reportCsv(
                  fields.map(([field]) => field),
                  [],
                ),
                'LCPS-account-import-template.csv',
              )
            }
          >
            Download CSV template
          </button>
          <div className="row gap">
            <label className="field">
              <span>Default role</span>
              <select
                value={defaultRole}
                disabled={busy || created > 0}
                onChange={(event) => {
                  setDefaultRole(event.target.value);
                  setPreviewed(false);
                  setOutcomes({});
                }}
              >
                {availableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Default department</span>
              <select
                value={departmentId}
                disabled={busy || user.role === 'HOD' || created > 0}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setProgramId('');
                  setBatchId('');
                  setPreviewed(false);
                }}
              >
                <option value="">Select department if needed</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Default program</span>
              <select
                value={programId}
                disabled={busy || created > 0}
                onChange={(event) => {
                  setProgramId(event.target.value);
                  setBatchId('');
                  setPreviewed(false);
                }}
              >
                <option value="">Select program if needed</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Default academic session</span>
              <select
                value={sessionId}
                disabled={busy || created > 0}
                onChange={(event) => {
                  setSessionId(event.target.value);
                  setBatchId('');
                  setPreviewed(false);
                }}
              >
                <option value="">Select session if needed</option>
                {data.sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Default class / batch</span>
              <select
                value={batchId}
                disabled={busy || created > 0}
                onChange={(event) => {
                  setBatchId(event.target.value);
                  setPreviewed(false);
                }}
              >
                <option value="">Select class for students if needed</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {data.departments.find((row) => row.id === batch.departmentId)?.name} ·{' '}
                    {data.programs.find((row) => row.id === batch.programId)?.name} ·{' '}
                    {data.sessions.find((row) => row.id === batch.sessionId)?.name} · {batch.name} ·
                    Semester {batch.semester}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Default teacher appointment</span>
              <select
                value={employmentType}
                disabled={busy || created > 0}
                onChange={(event) => {
                  setEmploymentType(event.target.value);
                  setPreviewed(false);
                }}
              >
                <option value="">Select if importing teachers</option>
                <option value="Visiting">Visiting</option>
                <option value="Permanent">Permanent</option>
              </select>
            </label>
            <label className="field">
              <span>Account file</span>
              <input
                type="file"
                accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy || created > 0}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void loadFile(file);
                }}
              />
            </label>
          </div>

          {fileData && (
            <>
              <h4>Map file columns</h4>
              <p>
                Required: full name and username. Map role, department, program, session and class
                when these vary by row.
              </p>
              <div className="account-import-mappings">
                {fields.map(([field, label, required]) => (
                  <label className="field" key={field}>
                    <span>
                      {label}
                      {required && <em>*</em>}
                    </span>
                    <select
                      value={mapping[field] || ''}
                      disabled={busy || created > 0}
                      onChange={(event) => {
                        setMapping((previous) => ({ ...previous, [field]: event.target.value }));
                        setPreviewed(false);
                        setOutcomes({});
                      }}
                    >
                      <option value="">Not mapped</option>
                      {fileData.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p>
                {records.length} accounts · {created} created · {validCount} ready
                {previewed ? ` · ${invalidCount} rejected` : ''}
              </p>
              <div className="table-wrap import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>File row</th>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Program / session / class</th>
                      <th>Status and details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => {
                      const rowNumber = Number(record._rowNumber);
                      const outcome = outcomes[rowNumber];
                      const batch = data.batches.find(
                        (candidate) =>
                          candidate.id === record.batchId || candidate.name === record.batchId,
                      );
                      const program = data.programs.find(
                        (candidate) =>
                          candidate.id === record.programId || candidate.name === record.programId,
                      );
                      const session = data.sessions.find(
                        (candidate) =>
                          candidate.id === record.sessionId || candidate.name === record.sessionId,
                      );
                      return (
                        <tr key={rowNumber}>
                          <td>{rowNumber}</td>
                          <td>{record.name || '—'}</td>
                          <td>{record.username || '—'}</td>
                          <td>{record.role || defaultRole}</td>
                          <td>
                            {[
                              program?.name || record.programId,
                              session?.name || record.sessionId,
                              batch?.name || record.batchId,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </td>
                          <td>
                            <strong>{outcome?.status || 'Not validated'}</strong>
                            {outcome?.errors.map((error) => (
                              <small className="import-row-error" key={error}>
                                {error}
                              </small>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="row gap account-import-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || created > 0}
                  onClick={async () => {
                    setBusy(true);
                    setMessage('');
                    try {
                      const prepared = prepareRecords();
                      const result = await request({
                        action: 'validateUserImport',
                        rows: prepared,
                      });
                      const next: Record<number, { status: string; errors: string[] }> = {};
                      for (const row of result.rows)
                        next[row.rowNumber] = {
                          status: row.errors.length ? 'Rejected' : 'Ready',
                          errors: row.errors,
                        };
                      setOutcomes(next);
                      setPreviewed(true);
                      setMessage(
                        result.valid
                          ? 'Validation passed. Review the preview before importing.'
                          : 'Validation found issues. Valid rows can still be imported; rejected rows will be skipped.',
                      );
                    } catch (error) {
                      setMessage((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Validating…' : 'Validate and preview'}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !previewed || validCount === 0 || created > 0}
                  onClick={async () => {
                    setBusy(true);
                    setMessage('');
                    let imported = 0;
                    const updated = { ...outcomes };
                    try {
                      const readyRows = records.filter(
                        (record) => outcomes[Number(record._rowNumber)]?.status === 'Ready',
                      );
                      for (let index = 0; index < readyRows.length; index += 25) {
                        const result = await request({
                          action: 'importUsers',
                          rows: readyRows.slice(index, index + 25),
                        });
                        for (const row of result.created) {
                          updated[row.rowNumber] = { status: 'Created', errors: [] };
                          imported++;
                        }
                        for (const row of result.rejected)
                          updated[row.rowNumber] = { status: 'Rejected', errors: row.errors };
                        setOutcomes({ ...updated });
                        setCreated(imported);
                      }
                      setMessage(
                        `${imported} account${imported === 1 ? '' : 's'} created. ${Object.values(updated).filter((item) => item.status === 'Rejected').length} row(s) rejected; review the row details.`,
                      );
                    } catch (error) {
                      setMessage(
                        `${imported} accounts created before the request failed: ${(error as Error).message}`,
                      );
                    } finally {
                      setBusy(false);
                      await refresh();
                    }
                  }}
                >
                  {busy ? 'Importing…' : 'Import valid accounts'}
                </button>
                {created > 0 && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      saveCsv(
                        reportCsv(
                          [
                            'Name',
                            'Username',
                            'Role',
                            'Student / employee ID',
                            'Temporary password',
                          ],
                          createdRecords.map((record) => [
                            record.name,
                            record.username,
                            record.role,
                            record.identifier,
                            record.password,
                          ]),
                        ),
                        'LCPS-imported-account-credentials.csv',
                      )
                    }
                  >
                    Download created-account credentials
                  </button>
                )}
              </div>
            </>
          )}
          {message && (
            <p role="status" className="preserve">
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
