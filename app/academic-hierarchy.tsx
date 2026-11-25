'use client';
import { ScheduleActivities, DeleteScheduledClass } from './schedule-activities';
import { SubjectCard } from './subject-card';
import { rollOrder } from '@/lib/lms/ordering';
import { UserPhoto, UserDirectory } from './user-directory';
import { AttendanceSummary } from './academic-components';
import { useState } from 'react';
import { Data, Row } from '@/lib/lms/types';
import { permitted } from '@/security/privileges';
import { attendancePercent } from '@/security/authorization';
import { hierarchyBatches, offeringStudents, sessionData } from '@/lib/lms/hierarchy';
import { reportOptions as downloadReport } from '@/lib/lms/export';
import { timetableGrids } from '@/lib/lms/timetable-view';
import { timetableExportOptions } from '@/lib/lms/timetable-export';
import { TimetableFiles } from './timetable-files';
type Mode = 'attendance' | 'results' | 'timetable' | 'enrollments' | 'offerings' | 'users';
const title: Record<Mode, string> = {
  attendance: 'Attendance',
  results: 'Results',
  timetable: 'Timetable',
  enrollments: 'Student enrollment',
  offerings: 'Teaching assignments',
  users: 'Accounts',
};
const name = (data: Data, table: string, id: string) =>
  data[table]?.find((r) => r.id === id)?.name || 'Not specified';
export function TimetableSchedule({
  data,
  user,
  onEdit,
}: {
  data: Data;
  user: Row;
  onEdit?: (row: Row) => void;
}) {
  const grids = timetableGrids(data);
  return (
    <>
      {permitted(user, 'timetable') && <ScheduleActivities data={data} user={user} />}
      {permitted(user, 'reports') &&
        (data.timetable.length > 0 || !!data.scheduleEvents?.length) && (
          <button className="btn" onClick={() => timetableExportOptions(grids)}>
            Download timetable
          </button>
        )}
      {grids.map((grid) => (
        <section className="panel operations-panel" key={grid.id}>
          <h3>{grid.title}</h3>

          {/* Desktop / tablet: horizontal scrollable table */}
          <div className="table-wrap weekly-schedule-wrap">
            <table className="weekly-schedule">
              <thead>
                <tr>
                  <th scope="col">Day / Time</th>
                  {grid.slots.map((slot) => (
                    <th scope="col" key={slot}>
                      {slot.replace('|', ' – ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.days.map((day) => (
                  <tr key={day.day}>
                    <th scope="row">{day.day}</th>
                    {day.cells.map((cell, index) => (
                      <td key={grid.slots[index]}>
                        {cell.length ? (
                          cell.map((c) => (
                            <div className="weekly-class" key={c.record.id}>
                              <small>
                                {c.record.startTime} – {c.record.endTime}
                              </small>
                              <strong>{c.subject}</strong>
                              <small>{c.teacher}</small>
                              <small>{c.room}</small>
                              {c.record.updatedBy && (
                                <small>
                                  Updated by{' '}
                                  {data.users.find((u) => u.id === c.record.updatedBy)?.name ||
                                    'Staff'}
                                </small>
                              )}
                              {!c.record.isActivity && onEdit && permitted(user, 'timetable') && (
                                <button className="text-btn" onClick={() => onEdit(c.record)}>
                                  Edit class
                                </button>
                              )}
                              {permitted(user, 'timetable') && (
                                <DeleteScheduledClass
                                  record={c.record}
                                  event={!!c.record.isActivity}
                                />
                              )}
                            </div>
                          ))
                        ) : (
                          <span aria-label="No scheduled class">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!grid.days.length && <p>No scheduled classes for this batch.</p>}
          </div>

          {/* Mobile: vertical day-by-day card layout */}
          <div className="weekly-schedule-mobile" aria-label={grid.title + ' mobile timetable'}>
            {grid.days.length === 0 && <p>No scheduled classes for this batch.</p>}
            {grid.days.map((day) => (
              <div className="wm-day" key={day.day}>
                <h4 className="wm-day-name">{day.day}</h4>
                <div className="wm-periods">
                  {grid.slots.map((slot, index) => {
                    const cell = day.cells[index];
                    if (!cell?.length) return null;
                    return (
                      <div className="wm-period" key={slot}>
                        <div className="wm-time">{slot.replace('|', ' – ')}</div>
                        <div className="wm-classes">
                          {cell.map((c) => (
                            <div className="wm-class" key={c.record.id}>
                              <span className="wm-time">
                                {c.record.startTime} – {c.record.endTime}
                              </span>
                              <strong className="wm-subject">{c.subject}</strong>
                              {c.teacher && <span className="wm-teacher">{c.teacher}</span>}
                              {c.room && <span className="wm-room">{c.room}</span>}
                              {c.record.updatedBy && (
                                <span className="wm-updated">
                                  Updated by{' '}
                                  {data.users.find((u) => u.id === c.record.updatedBy)?.name ||
                                    'Staff'}
                                </span>
                              )}
                              <div className="wm-actions">
                                {!c.record.isActivity && onEdit && permitted(user, 'timetable') && (
                                  <button className="text-btn" onClick={() => onEdit(c.record)}>
                                    Edit class
                                  </button>
                                )}
                                {permitted(user, 'timetable') && (
                                  <DeleteScheduledClass
                                    record={c.record}
                                    event={!!c.record.isActivity}
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {day.cells.every((cell) => !cell?.length) && (
                    <p className="wm-empty">No classes scheduled</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!grids.length && <p className="panel">No classes found for this selection.</p>}
    </>
  );
}
export function AcademicHierarchy({
  data,
  user,
  mode,
  refresh,
  onDeleteTimetable,
  onEditTimetable,
}: {
  data: Data;
  user: Row;
  mode: Mode;
  refresh?: () => Promise<void>;
  onDeleteTimetable?: (file: Row) => void;
  onEditTimetable?: (row: Row) => void;
}) {
  const [departmentId, setDepartment] = useState(''),
    [sessionId, setSession] = useState(''),
    [offeringId, setOffering] = useState(''),
    [studentId, setStudent] = useState('');
  const hod = user.role === 'HOD',
    department = data.departments.find((d) => d.id === (hod ? user.departmentId : departmentId));
  const batches = department ? hierarchyBatches(data, user, department.id) : [];
  const sessions = data.sessions.filter((s) => batches.some((b) => b.sessionId === s.id));
  const session = sessions.find((s) => s.id === sessionId),
    selectedBatches = session ? batches.filter((b) => b.sessionId === session.id) : [];
  const offerings = data.offerings.filter((o) => selectedBatches.some((b) => b.id === o.batchId));
  const offering = offerings.find((o) => o.id === offeringId),
    students = offering ? offeringStudents(data, offering.id) : [];
  const student = students.find((s) => s.id === studentId);
  const allowedKey =
    mode === 'enrollments' || mode === 'offerings'
      ? 'view_academic'
      : mode === 'users'
        ? 'reports'
        : 'view_' + mode;
  if (!permitted(user, allowedKey))
    return <p className="panel">Access to {title[mode].toLowerCase()} is disabled.</p>;
  const courseLabel = (o: Row) => {
    const b = selectedBatches.find((b) => b.id === o.batchId);
    return `${name(data, 'subjects', o.subjectId)} · ${name(data, 'programs', b?.programId)} · ${b?.name || ''} · Semester ${b?.semester || ''}`;
  };
  const resetSession = () => {
    setSession('');
    setOffering('');
    setStudent('');
  };
  const records =
    student && offering
      ? (
          data[
            mode === 'attendance' ? 'attendance' : mode === 'results' ? 'results' : 'enrollments'
          ] || []
        )
          .filter((r) => r.offeringId === offering.id && r.studentId === student.id)
          .sort((a, b) =>
            String(a.date || a.title || '').localeCompare(String(b.date || b.title || '')),
          )
      : [];
  const headers =
    mode === 'attendance'
      ? ['Date', 'Status']
      : mode === 'results'
        ? ['Assessment', 'Marks', 'Maximum', 'Percentage', 'Publication', 'Feedback']
        : ['Subject', 'Enrollment'];
  const rows = records.map((r) =>
    mode === 'attendance'
      ? [r.date, r.status]
      : mode === 'results'
        ? [
            r.title,
            String(r.marks),
            String(r.maxMarks),
            r.maxMarks ? `${Math.round((r.marks / r.maxMarks) * 100)}%` : '—',
            r.published ? 'Published' : 'Draft',
            r.feedback || '—',
          ]
        : [name(data, 'subjects', offering!.subjectId), r.active ? 'Active' : 'Archived'],
  );
  function exportSelection() {
    if (!student || !offering || !permitted(user, 'reports')) return;
    downloadReport(
      `${title[mode]} · ${department?.name} · ${session?.name} · ${courseLabel(offering)} · ${student.name}`,
      'LCPS-' + mode,
      headers,
      rows,
      'word',
    );
  }
  return (
    <section className="academic-hierarchy">
      <nav
        className="row gap hierarchy-path"
        aria-label={title[mode] + ' hierarchy'}
        style={{ flexWrap: 'wrap', marginBottom: 18 }}
      >
        <button
          className="btn"
          onClick={() => {
            if (!hod) setDepartment('');
            resetSession();
          }}
        >
          {title[mode]}
        </button>
        {department && (
          <>
            <span>›</span>
            <button className="btn" onClick={resetSession}>
              {department.name}
            </button>
          </>
        )}
        {session && (
          <>
            <span>›</span>
            <button
              className="btn"
              onClick={() => {
                setOffering('');
                setStudent('');
              }}
            >
              {session.name}
            </button>
          </>
        )}
        {offering && mode !== 'timetable' && (
          <>
            <span>›</span>
            <button className="btn" onClick={() => setStudent('')}>
              {name(data, 'subjects', offering.subjectId)}
            </button>
          </>
        )}
        {student && (
          <>
            <span>›</span>
            <strong>{student.name}</strong>
          </>
        )}
      </nav>
      {!department ? (
        <section className="panel operations-panel">
          <h2>Select department</h2>
          <div className="row gap" style={{ flexWrap: 'wrap' }}>
            {data.departments.map((d) => (
              <button
                className="btn"
                key={d.id}
                onClick={() => {
                  setDepartment(d.id);
                  resetSession();
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
          {!data.departments.length && <p>No departments available.</p>}
        </section>
      ) : !session ? (
        <section className="panel operations-panel">
          <h2>Select session</h2>
          <p>{department.name}</p>
          <div className="row gap" style={{ flexWrap: 'wrap' }}>
            {sessions.map((s) => (
              <button
                className="btn"
                key={s.id}
                onClick={() => {
                  setSession(s.id);
                  setOffering('');
                  setStudent('');
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
          {!sessions.length && <p>No sessions are linked to batches in this department yet.</p>}
        </section>
      ) : mode === 'timetable' ? (
        <>
          <h2>
            {department.name} · {session.name}
          </h2>
          <details>
            <summary>Uploaded timetable reference</summary>
            <TimetableFiles
              data={sessionData(data, selectedBatches)}
              user={refresh ? user : { ...user, role: 'PRINCIPAL' }}
              onUploaded={refresh || (() => Promise.resolve())}
              onDelete={onDeleteTimetable || (() => {})}
            />
          </details>
          <TimetableSchedule
            data={sessionData(data, selectedBatches)}
            user={user}
            onEdit={onEditTimetable}
          />
        </>
      ) : !offering ? (
        <section className="panel operations-panel">
          <h2>Select subject</h2>
          <p>Each subject is identified by its program, batch and semester.</p>
          <div className="subjects-grid full-grid">
            {offerings.map((o, i) => (
              <SubjectCard
                key={o.id}
                offering={o}
                data={data}
                index={i}
                onSelect={() => {
                  setOffering(o.id);
                  setStudent('');
                }}
              />
            ))}
          </div>
          {!offerings.length && <p>No subjects assigned for this session.</p>}
        </section>
      ) : !student ? (
        <section className="panel operations-panel">
          <h2>{mode === 'attendance' ? 'Subject attendance — class report' : 'Select student'}</h2>
          <p>{courseLabel(offering)}</p>
          <p>Teacher: {name(data, 'users', offering.teacherId)}</p>
          {mode === 'attendance' && (
            <div className="row gap attendance-actions">
              <button
                className="btn primary"
                onClick={() => {
                  const el = document.getElementById('hod-attendance-report');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                View online
              </button>
              <button
                className="btn"
                onClick={() => {
                  const rows = students.flatMap((s) =>
                    data.attendance
                      .filter((a) => a.offeringId === offering.id && a.studentId === s.id)
                      .map((a) => [a.date, s.name, s.identifier || '—', a.status]),
                  );
                  downloadReport(
                    'Attendance · ' + courseLabel(offering),
                    'LCPS-subject-attendance',
                    ['Date', 'Student', 'Roll / registration ID', 'Status'],
                    rows,
                    'word',
                  );
                }}
              >
                Download attendance
              </button>
            </div>
          )}
          <div
            id={mode === 'attendance' ? 'hod-attendance-report' : undefined}
            className="table-wrap hierarchy-report-table"
          >
            <table>
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Photo</th>
                  <th>Student</th>
                  <th>Roll / registration ID</th>
                  {mode === 'attendance' && <th>Attendance %</th>}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {students
                  .slice()
                  .sort(rollOrder)
                  .map((s, index) => (
                    <tr key={s.id}>
                      <td data-label="S.No.">{index + 1}</td>
                      <td data-label="Photo">
                        <UserPhoto user={s} />
                      </td>
                      <td data-label="Student">{s.name}</td>
                      <td data-label="Roll / registration ID">{s.identifier || '—'}</td>
                      {mode === 'attendance' && (
                        <td data-label="Attendance %">
                          {attendancePercent(
                            data.attendance.filter(
                              (a) => a.offeringId === offering.id && a.studentId === s.id,
                            ),
                          ) === null
                            ? 'N/A'
                            : attendancePercent(
                                data.attendance.filter(
                                  (a) => a.offeringId === offering.id && a.studentId === s.id,
                                ),
                              ) + '%'}
                        </td>
                      )}
                      <td data-label="Action">
                        <button
                          className="btn"
                          aria-label={'View ' + title[mode] + ' for ' + s.name}
                          onClick={() => setStudent(s.id)}
                        >
                          View {title[mode].toLowerCase()}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!students.length && (
              <p>No enrolled students or historical records for this subject.</p>
            )}
          </div>
        </section>
      ) : (
        <section className="panel operations-panel">
          <div className="row between">
            <div>
              <h2>
                {student.name} — {title[mode]}
              </h2>
              <p>
                {courseLabel(offering)} · {student.identifier || 'No ID recorded'}
              </p>
            </div>
            {permitted(user, 'reports') && rows.length > 0 && (
              <button className="btn" onClick={exportSelection}>
                Download this report
              </button>
            )}
          </div>
          {mode === 'attendance' && <AttendanceSummary records={records} />}
          {mode === 'results' && (
            <div>
              {data.resultFiles
                .filter((f) => f.offeringId === offering.id)
                .map((f) => (
                  <p key={f.id}>
                    <a href={'/api/files/' + f.fileId}>Download class result sheet (whole class)</a>
                  </p>
                ))}
            </div>
          )}
          {mode === 'results' && (
            <p>
              Published assessments: {records.filter((r) => r.published).length} · Draft
              assessments: {records.filter((r) => !r.published).length}. Percentages below are per
              assessment; no unweighted GPA is inferred.
            </p>
          )}
          {mode === 'users' && permitted(user, 'view_users') && (
            <div>
              <p>
                Email: {student.email || '—'} · Phone: {student.phone || '—'}
              </p>
              <p>Account: {student.active ? 'Active' : 'Inactive'}</p>
            </div>
          )}
          {mode === 'offerings' && (
            <p>Assigned teacher: {name(data, 'users', offering.teacherId)}</p>
          )}
          <div className="table-wrap hierarchy-report-table">
            <table>
              <thead>
                <tr>
                  <th>S.No.</th>
                  {headers.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={records[i].id}>
                    <td data-label="S.No.">{i + 1}</td>
                    {row.map((cell, j) => (
                      <td key={j} data-label={headers[j]}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p>No {title[mode].toLowerCase()} records for this student in this subject.</p>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

export function HodTimetable({
  data,
  user,
  refresh,
  onDelete,
  onEdit,
}: {
  data: Data;
  user: Row;
  refresh: () => Promise<void>;
  onDelete: (file: Row) => void;
  onEdit: (row: Row) => void;
}) {
  const [tab, setTab] = useState('mine');
  const own = sessionData(
    data,
    data.batches.filter((b) => b.departmentId === user.departmentId),
    user.id,
  );
  return (
    <>
      <div className="tabs" role="tablist" aria-label="HOD timetable">
        <button
          role="tab"
          aria-selected={tab === 'mine'}
          className={tab === 'mine' ? 'active' : ''}
          onClick={() => setTab('mine')}
        >
          My Classes
        </button>
        <button
          role="tab"
          aria-selected={tab === 'department'}
          className={tab === 'department' ? 'active' : ''}
          onClick={() => setTab('department')}
        >
          Departmental Classes
        </button>
      </div>
      {permitted(user, 'timetable') && (
        <button className="btn primary" onClick={() => onEdit({})}>
          Add class
        </button>
      )}
      {tab === 'mine' ? (
        <>
          <p>Only classes assigned to you as the teacher appear here.</p>
          <TimetableSchedule data={own} user={user} onEdit={onEdit} />
        </>
      ) : (
        <AcademicHierarchy
          data={data}
          user={user}
          mode="timetable"
          refresh={refresh}
          onDeleteTimetable={onDelete}
          onEditTimetable={onEdit}
        />
      )}
    </>
  );
}
