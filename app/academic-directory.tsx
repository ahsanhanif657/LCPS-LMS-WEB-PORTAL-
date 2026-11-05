'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, GraduationCap, Users } from 'lucide-react';
import { Data, Row } from '@/lib/lms/types';
import { rollOrder } from '@/lib/lms/ordering';
import { Modal, PageTitle } from './portal-ui';
import { ProfileDetails, ProfilePhoto } from './profile-extras';

type DirectoryMode = 'department' | 'college' | 'class';

export function AcademicDirectory({
  data,
  user,
  mode,
}: {
  data: Data;
  user: Row;
  mode: DirectoryMode;
}) {
  const [departmentId, setDepartmentId] = useState(
      mode === 'department' ? user.departmentId || '' : '',
    ),
    [programId, setProgramId] = useState(''),
    [sessionId, setSessionId] = useState(''),
    [profile, setProfile] = useState<Row | null>(null);
  const department = data.departments.find((d) => d.id === departmentId),
    programs = data.programs.filter((p) => p.departmentId === departmentId),
    pharmacyAlias =
      /pharm|pharmacy/i.test(department?.name || '') &&
      /pharm|pharmacy/i.test(programs[0]?.name || ''),
    sameNameProgram =
      programs.length === 1 &&
      (programs[0].name.trim().toLowerCase() === department?.name.trim().toLowerCase() ||
        pharmacyAlias),
    directSessions = programs.length === 0 || sameNameProgram;
  const currentBatch =
    mode === 'class' ? data.batches.find((b) => b.id === user.batchId) : undefined;
  const directoryOfferings =
    mode === 'class' ? data.academicDirectoryOfferings || data.offerings : data.offerings;
  const applicableBatches =
    mode === 'class'
      ? currentBatch
        ? data.batches.filter(
            (b) =>
              b.departmentId === currentBatch.departmentId &&
              b.programId === currentBatch.programId &&
              b.sessionId === currentBatch.sessionId &&
              b.semester === currentBatch.semester,
          )
        : []
      : data.batches.filter(
          (b) =>
            b.departmentId === departmentId &&
            (!programId || b.programId === programId) &&
            (!sessionId || b.sessionId === sessionId),
        );
  const batchIds = new Set(applicableBatches.map((b) => b.id));
  const offerings = directoryOfferings.filter((o) => batchIds.has(o.batchId) && o.active !== 0);
  const students = data.users
    .filter(
      (person) =>
        person.role === 'STUDENT' &&
        person.active !== 0 &&
        (mode === 'class'
          ? applicableBatches.some((b) => b.id === person.batchId)
          : person.departmentId === departmentId &&
            applicableBatches.some((b) => b.id === person.batchId)),
    )
    .sort(rollOrder);
  const teacherIds = new Set(
    offerings.flatMap((o) => [o.teacherId, o.coTeacherId].filter(Boolean)),
  );
  const teachers = data.users
    .filter(
      (person) => person.role === 'TEACHER' && person.active !== 0 && teacherIds.has(person.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const sessions = data.sessions.filter(
    (session) =>
      session.active !== 0 &&
      data.batches.some(
        (batch) =>
          batch.departmentId === departmentId &&
          (!programId || batch.programId === programId) &&
          batch.sessionId === session.id,
      ),
  );
  const sessionSelected = mode === 'class' || !!sessionId;
  const pageTitle =
    mode === 'department' ? 'My Department' : mode === 'college' ? 'My College' : 'My Class';

  function back() {
    if (sessionId) setSessionId('');
    else if (mode === 'college' && programId) setProgramId('');
    else if (mode === 'college' && departmentId) setDepartmentId('');
  }

  function openProfile(person: Row) {
    setProfile(person);
  }

  const teacherOfferings = profile
    ? directoryOfferings.filter(
        (o) =>
          o.active !== 0 &&
          batchIds.has(o.batchId) &&
          (o.teacherId === profile.id || o.coTeacherId === profile.id),
      )
    : [];

  return (
    <section className="academic-directory">
      <PageTitle
        title={pageTitle}
        text={
          mode === 'department'
            ? 'Explore your department’s programs, sessions and academic community.'
            : mode === 'college'
              ? 'Browse academic departments and their programs, sessions and community.'
              : 'Your current program, session and semester community.'
        }
      />
      {mode !== 'class' && (
        <div className="directory-breadcrumbs" aria-label="Academic directory navigation">
          {((mode === 'college' && departmentId) || sessionId) && (
            <button className="btn" onClick={back}>
              <ChevronLeft size={16} />
              Back
            </button>
          )}
          {mode === 'college' && (
            <span>
              My College{department ? ` / ${department.name}` : ''}
              {programId ? ` / ${data.programs.find((p) => p.id === programId)?.name || ''}` : ''}
              {sessionId ? ` / ${data.sessions.find((s) => s.id === sessionId)?.name || ''}` : ''}
            </span>
          )}
          {mode === 'department' && (
            <span>
              My Department
              {programId ? ` / ${data.programs.find((p) => p.id === programId)?.name || ''}` : ''}
              {sessionId ? ` / ${data.sessions.find((s) => s.id === sessionId)?.name || ''}` : ''}
            </span>
          )}
        </div>
      )}

      {mode === 'college' && !departmentId && (
        <div className="directory-card-grid">
          {data.departments
            .filter((d) => d.active !== 0)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <button
                className="directory-navigation-card"
                key={item.id}
                onClick={() => {
                  setDepartmentId(item.id);
                  setProgramId('');
                  setSessionId('');
                }}
              >
                <span className="directory-card-icon">
                  <GraduationCap size={21} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {data.programs.filter((p) => p.departmentId === item.id).length} programs
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          {!data.departments.length && <p className="panel">No active departments available.</p>}
        </div>
      )}

      {mode === 'department' && !programId && (
        <div className="directory-card-grid">
          {programs
            .filter((p) => p.active !== 0)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <button
                className="directory-navigation-card"
                key={item.id}
                onClick={() => {
                  setProgramId(item.id);
                  setSessionId('');
                }}
              >
                <span className="directory-card-icon">
                  <GraduationCap size={21} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {data.batches.filter((b) => b.programId === item.id).length} class sessions
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          {!programs.length && (
            <p className="panel">No programs are assigned to this department.</p>
          )}
        </div>
      )}

      {mode === 'college' && departmentId && !sessionId && !programId && !directSessions && (
        <div className="directory-card-grid">
          {programs
            .filter((p) => p.active !== 0)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <button
                className="directory-navigation-card"
                key={item.id}
                onClick={() => {
                  setProgramId(item.id);
                  setSessionId('');
                }}
              >
                <span className="directory-card-icon">
                  <GraduationCap size={21} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {data.batches.filter((b) => b.programId === item.id).length} class sessions
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
        </div>
      )}

      {mode !== 'class' &&
        departmentId &&
        !sessionId &&
        (mode === 'department' ? !!programId : directSessions || !!programId) && (
          <div className="directory-card-grid">
            {sessions.map((item) => (
              <button
                className="directory-navigation-card"
                key={item.id}
                onClick={() => setSessionId(item.id)}
              >
                <span className="directory-card-icon">
                  <Users size={20} />
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {
                      data.batches.filter(
                        (b) =>
                          b.departmentId === departmentId &&
                          (!programId || b.programId === programId) &&
                          b.sessionId === item.id,
                      ).length
                    }{' '}
                    classes
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
            {!sessions.length && (
              <p className="panel">No academic sessions are available for this selection.</p>
            )}
          </div>
        )}

      {sessionSelected && (
        <div className="directory-session-content">
          {mode === 'class' && (
            <div className="directory-class-summary">
              <span>{data.programs.find((p) => p.id === currentBatch?.programId)?.name}</span>
              <strong>{data.sessions.find((s) => s.id === currentBatch?.sessionId)?.name}</strong>
              <span>Semester {currentBatch?.semester}</span>
            </div>
          )}
          {mode !== 'class' && (
            <div className="directory-class-summary">
              <span>{department?.name}</span>
              {programId && <span>{data.programs.find((p) => p.id === programId)?.name}</span>}
              <strong>{data.sessions.find((s) => s.id === sessionId)?.name}</strong>
            </div>
          )}
          <div className="directory-section-grid">
            <section className="panel directory-section">
              <div className="directory-section-heading">
                <div>
                  <h2>Students</h2>
                  <p>{students.length} students in the selected semester</p>
                </div>
              </div>
              <div className="directory-people-list">
                {students.map((person) => (
                  <div className="directory-person" key={person.id}>
                    <ProfilePhoto user={person} />
                    <div className="directory-person-info">
                      <button className="directory-person-link" onClick={() => openProfile(person)}>
                        {person.name}
                      </button>
                      <small>{person.identifier || person.id}</small>
                      <small>
                        {data.programs.find((p) => p.id === person.programId)?.name ||
                          data.programs.find(
                            (p) =>
                              p.id === data.batches.find((b) => b.id === person.batchId)?.programId,
                          )?.name}
                        {person.batchId
                          ? ` · ${data.batches.find((b) => b.id === person.batchId)?.name || ''}`
                          : ''}
                      </small>
                    </div>
                  </div>
                ))}
                {!students.length && <p className="muted">No students are assigned here.</p>}
              </div>
            </section>

            <section className="panel directory-section">
              <div className="directory-section-heading">
                <div>
                  <h2>Teachers</h2>
                  <p>Teaching in this semester</p>
                </div>
              </div>
              <div className="directory-people-list">
                {teachers.map((person) => (
                  <div className="directory-person" key={person.id}>
                    <ProfilePhoto user={person} />
                    <div className="directory-person-info">
                      <button className="directory-person-link" onClick={() => openProfile(person)}>
                        {person.name}
                      </button>
                      <small>{person.designation || 'Faculty member'}</small>
                      <small>
                        {offerings
                          .filter((o) => o.teacherId === person.id || o.coTeacherId === person.id)
                          .map((o) => data.subjects.find((s) => s.id === o.subjectId)?.name)
                          .filter(Boolean)
                          .join(', ')}
                      </small>
                    </div>
                  </div>
                ))}
                {!teachers.length && <p className="muted">No teachers are assigned here.</p>}
              </div>
            </section>

            <section className="panel directory-section directory-subjects">
              <div className="directory-section-heading">
                <div>
                  <h2>Current Semester Subjects</h2>
                  <p>Subjects assigned to the selected program and session</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Code</th>
                      <th>Program / class</th>
                      <th>Semester</th>
                      <th>Teacher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offerings.map((offering) => {
                      const subject = data.subjects.find((s) => s.id === offering.subjectId),
                        batch = data.batches.find((b) => b.id === offering.batchId),
                        teacher = data.users.find((t) => t.id === offering.teacherId);
                      return (
                        <tr key={offering.id}>
                          <td>
                            <strong>{subject?.name || 'Subject'}</strong>
                          </td>
                          <td>{subject?.code || '—'}</td>
                          <td>
                            {data.programs.find((p) => p.id === batch?.programId)?.name || '—'}
                            {batch ? ` · ${batch.name}` : ''}
                          </td>
                          <td>{batch?.semester || '—'}</td>
                          <td>{teacher?.name || 'Not assigned'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!offerings.length && (
                  <p className="directory-table-empty">
                    No current semester subjects are assigned.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {profile && (
        <Modal
          title={profile.name}
          subtitle={profile.role === 'TEACHER' ? 'Teacher profile' : 'Student profile'}
          onClose={() => setProfile(null)}
          wide
        >
          <div className="modal-body directory-profile">
            <ProfilePhoto user={profile} size="large" />
            <div className="directory-profile-copy">
              <p>
                {profile.identifier || (profile.role === 'TEACHER' ? 'Faculty member' : 'Student')}
              </p>
              {profile.designation && <p>{profile.designation}</p>}
              {profile.profileNote && (
                <p>
                  <strong>Notes</strong>
                  <br />
                  {profile.profileNote}
                </p>
              )}
              <ProfileDetails user={profile} />
            </div>
            {profile.role === 'TEACHER' && (
              <section className="directory-profile-subjects">
                <h3>Assigned subjects</h3>
                {teacherOfferings.map((o) => {
                  const batch = data.batches.find((b) => b.id === o.batchId);
                  return (
                    <p key={o.id}>
                      {data.subjects.find((s) => s.id === o.subjectId)?.name || 'Subject'} ·{' '}
                      {data.programs.find((p) => p.id === batch?.programId)?.name || 'Program'} ·
                      Semester {batch?.semester || '—'}
                    </p>
                  );
                })}
                {!teacherOfferings.length && <p>No assigned subjects in this selection.</p>}
              </section>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
