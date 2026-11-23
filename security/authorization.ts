import { canDeleteAnnouncement } from './announcement-access';
import { permitted, departmentAccess, RolePrivilegesConfig } from './privileges';
import { Data, Row } from '@/lib/lms/types';
export const broad = (u: Row) => ['ADMIN', 'PRINCIPAL', 'DIRECTOR', 'SUPER_ADMIN'].includes(u.role);
export const manager = (u: Row) =>
  ['ADMIN', 'PRINCIPAL', 'HOD'].includes(u.role) ||
  permitted(u, 'academic') ||
  permitted(u, 'timetable') ||
  permitted(u, 'users');
export function offeringAllowed(u: Row, o: Row, d: Data): boolean {
  if (broad(u) || permitted(u, 'exams') || ['TREASURER', 'REGISTRAR'].includes(u.role)) return true;
  const b = d.batches.find((b) => b.id === o.batchId);
  if (departmentAccess(u)) return b?.departmentId === u.departmentId;
  if (u.role === 'TEACHER')
    return o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id);
  if (u.role === 'STUDENT')
    return (
      o.active !== 0 &&
      (b?.id === u.batchId ||
        d.enrollments.some((e) => e.studentId === u.id && e.offeringId === o.id && e.active))
    );
  return false;
}
export function teachingAllowed(u: Row, o: Row): boolean {
  return (
    broad(u) ||
    (['TEACHER', 'HOD'].includes(u.role) &&
      (o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id)))
  );
}
export function materialsAllowed(u: Row, o: Row, batch?: Row): boolean {
  return (
    broad(u) ||
    teachingAllowed(u, o) ||
    (u.role === 'HOD' && batch?.departmentId === u.departmentId)
  );
}
export function canRecordAttendance(u: Row, o: Row): boolean {
  return (
    o.active !== 0 &&
    permitted(u, 'attendance') &&
    permitted(u, 'attendance_record') &&
    teachingAllowed(u, o)
  );
}
export function canCorrectAttendance(u: Row, o: Row): boolean {
  return (
    o.active !== 0 &&
    permitted(u, 'attendance') &&
    permitted(u, 'attendance_correct') &&
    teachingAllowed(u, o)
  );
}
// Results are the only teaching workflow delegated to the whole HOD department.
export function resultsAllowed(u: Row, o: Row, d: Data): boolean {
  if (u.role === 'ADMIN' || permitted(u, 'exams')) return true;
  if (u.role === 'HOD' || permitted(u, 'results_department'))
    return d.batches.some((b) => b.id === o.batchId && b.departmentId === u.departmentId);
  return broad(u) || o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id);
}
export function studentManageAllowed(u: Row, st: Row, d: Data): boolean {
  if (!permitted(u, 'student_enrollment')) return false;
  if (broad(u)) return st.role === 'STUDENT';
  return st.role === 'STUDENT' && st.departmentId === u.departmentId;
}
export function accountManageAllowed(u: Row, target: Row): boolean {
  if (u.role === 'SUPER_ADMIN') return true;
  if (u.role === 'ADMIN') return ['STUDENT', 'TEACHER'].includes(target.role);
  if (permitted(u, 'senior_accounts')) return true;
  return (
    permitted(u, 'users') &&
    ['STUDENT', 'TEACHER'].includes(target.role) &&
    target.departmentId === u.departmentId
  );
}
export function scopedData(u: Row, d: Data, config?: RolePrivilegesConfig): Data {
  const out: Data = {};
  out.personalEntries = (d.personalEntries || []).filter((r) => r.userId === u.id);
  out.managementRecords = (d.managementRecords || []).filter((r) => permitted(u, r.kind, config));
  const os = d.offerings.filter((o) => offeringAllowed(u, o, d));
  const ids = new Set(os.map((o) => o.id));
  const discussionOfferings = d.offerings.filter((offering) => {
    if (u.role === 'TEACHER')
      return offering.teacherId === u.id || offering.coTeacherId === u.id;
    if (u.role === 'STUDENT')
      return (
        offering.active !== 0 &&
        (offering.batchId === u.batchId ||
          d.enrollments.some(
            (enrollment) =>
              enrollment.studentId === u.id &&
              enrollment.offeringId === offering.id &&
              enrollment.active !== 0,
          ))
      );
    if (u.role === 'HOD')
      return d.batches.some(
        (batch) => batch.id === offering.batchId && batch.departmentId === u.departmentId,
      );
    return ids.has(offering.id);
  });
  const discussionOfferingIds = new Set(discussionOfferings.map((offering) => offering.id));
  const enrollments = d.enrollments.filter(
    (e) => ids.has(e.offeringId) && (u.role !== 'STUDENT' || e.studentId === u.id),
  );
  const studentIds = new Set(enrollments.map((e) => e.studentId));
  const studentBatch = u.role === 'STUDENT' ? d.batches.find((b) => b.id === u.batchId) : undefined;
  const classBatches = studentBatch
    ? d.batches.filter(
        (b) =>
          b.departmentId === studentBatch.departmentId &&
          b.programId === studentBatch.programId &&
          b.sessionId === studentBatch.sessionId &&
          b.semester === studentBatch.semester,
      )
    : [];
  const classBatchIds = new Set(classBatches.map((b) => b.id));
  const classmateIds = new Set(
    u.role === 'STUDENT'
      ? d.users
          .filter((v) => v.role === 'STUDENT' && v.active !== 0 && classBatchIds.has(v.batchId))
          .map((v) => v.id)
      : [],
  );
  const directoryOfferings =
    u.role === 'STUDENT'
      ? d.offerings.filter((o) => classBatchIds.has(o.batchId) && o.active !== 0)
      : [];
  const directoryTeacherIds = new Set(
    directoryOfferings.flatMap((o) => [o.teacherId, o.coTeacherId].filter(Boolean)),
  );
  const fullUsers = d.users.filter(
    (v) =>
      u.role === 'ADMIN' ||
      u.role === 'SUPER_ADMIN' ||
      (broad(u) && u.role !== 'PRINCIPAL') ||
      permitted(u, 'manage_access', config) ||
      v.id === u.id ||
      (departmentAccess(u) && v.departmentId === u.departmentId) ||
      (u.role === 'TEACHER' && studentIds.has(v.id) && v.role !== 'STUDENT'),
  );
  out.users = d.users
    .filter(
      (v) =>
        fullUsers.some((x) => x.id === v.id) ||
        (u.role === 'PRINCIPAL' && v.active !== 0 && ['STUDENT', 'TEACHER'].includes(v.role)) ||
        (u.role === 'STUDENT' && (classmateIds.has(v.id) || directoryTeacherIds.has(v.id))) ||
        (u.role === 'TEACHER' && studentIds.has(v.id)) ||
        (permitted(u, 'exams', config) && v.role === 'STUDENT') ||
        (['TEACHER', 'HOD'].includes(v.role) &&
          os.some((o) => o.teacherId === v.id || (!!o.coTeacherId && o.coTeacherId === v.id))) ||
        ['TREASURER', 'EXAMINATION_CONTROLLER', 'REGISTRAR'].includes(v.role),
    )
    .map((v) => {
      const retainAccountFields =
        fullUsers.some((x) => x.id === v.id) &&
        u.role !== 'PRINCIPAL' &&
        !(u.role === 'TEACHER' && v.role === 'STUDENT') &&
        !(u.role === 'STUDENT' && classmateIds.has(v.id));
      return retainAccountFields
        ? v
        : {
            id: v.id,
            name: v.name,
            role: v.role,
            departmentId: v.departmentId,
            batchId: v.batchId,
            programId: v.programId || d.batches.find((batch) => batch.id === v.batchId)?.programId,
            sessionId: v.sessionId || d.batches.find((batch) => batch.id === v.batchId)?.sessionId,
            identifier: v.identifier,
            avatar: v.avatar,
            active: v.active,
            qualifications: v.qualifications,
            bio: v.bio,
            profileLinks: v.profileLinks,
            profileNote: v.profileNote,
            designation: v.designation,
            employmentType: v.employmentType,
          };
    });
  out.coursePolicies = (d.coursePolicies || []).filter(
    (r) => ids.has(r.offeringId) && permitted(u, 'view_courseOutlines', config),
  );
  out.offerings = os;
  out.discussionThreads = permitted(u, 'view_discussions', config)
    ? (d.discussionThreads || []).filter((thread) => discussionOfferingIds.has(thread.offeringId))
    : [];
  const visibleThreadIds = new Set(out.discussionThreads.map((thread) => thread.id));
  out.discussionPosts = (d.discussionPosts || []).filter((post) => visibleThreadIds.has(post.threadId));
  out.enrollments = enrollments;
  out.departments = d.departments.filter(
    (x) =>
      broad(u) ||
      permitted(u, 'exams') ||
      ['TREASURER', 'REGISTRAR'].includes(u.role) ||
      x.id === u.departmentId,
  );
  out.programs = d.programs.filter(
    (x) =>
      broad(u) ||
      permitted(u, 'exams') ||
      ['TREASURER', 'REGISTRAR'].includes(u.role) ||
      x.departmentId === u.departmentId,
  );
  out.sessions = d.sessions;
  out.batches = d.batches.filter(
    (b) =>
      broad(u) ||
      (departmentAccess(u) && b.departmentId === u.departmentId) ||
      (u.role === 'STUDENT' && classBatchIds.has(b.id)) ||
      b.id === u.batchId ||
      os.some((o) => o.batchId === b.id),
  );
  out.academicDirectoryOfferings = directoryOfferings.map((o) => ({
    id: o.id,
    subjectId: o.subjectId,
    batchId: o.batchId,
    teacherId: o.teacherId,
    coTeacherId: o.coTeacherId,
    active: o.active,
  }));
  out.scheduleEvents = (d.scheduleEvents || []).filter(
    (e) => out.batches.some((b) => b.id === e.batchId) && permitted(u, 'view_timetable', config),
  );
  out.subjects = d.subjects
    .filter(
      (s) =>
        broad(u) ||
        (departmentAccess(u) && s.departmentId === u.departmentId) ||
        os.some((o) => o.subjectId === s.id) ||
        directoryOfferings.some((o) => o.subjectId === s.id),
    )
    .map((s) => {
      const assignedPrograms = (d.subjectPrograms || [])
        .filter((r) => r.subjectId === s.id)
        .map((r) => r.programId);
      const assignedSessions = (d.subjectSessions || []).filter((r) => r.subjectId === s.id);
      const legacyOfferings = os.filter((o) => o.subjectId === s.id);
      const legacyBatches = legacyOfferings
        .map((o) => d.batches.find((b) => b.id === o.batchId))
        .filter((b): b is Row => !!b);
      return {
        ...s,
        programIds: assignedPrograms.length
          ? [...new Set(assignedPrograms)]
          : [...new Set(legacyBatches.map((b) => b.programId))],
        sessionAssignments: [
          ...new Set([
            ...assignedSessions.map((r) => JSON.stringify([r.programId, r.sessionId])),
            ...legacyBatches.map((b) => JSON.stringify([b.programId, b.sessionId])),
          ]),
        ],
        sessionIds: [
          ...new Set([
            ...assignedSessions.map((r) => r.sessionId),
            ...legacyBatches.map((b) => b.sessionId),
          ]),
        ],
      };
    });
  const visibleSubjectIds = new Set(out.subjects.map((s) => s.id));
  out.subjectPrograms = (d.subjectPrograms || []).filter((r) => visibleSubjectIds.has(r.subjectId));
  out.subjectSessions = (d.subjectSessions || []).filter((r) => visibleSubjectIds.has(r.subjectId));
  out.hodScopes = d.hodScopes.filter((x) => u.role === 'SUPER_ADMIN' || x.userId === u.id);
  out.resultFiles = d.resultFiles.filter((r) => ids.has(r.offeringId));
  out.assessmentPolicies = d.assessmentPolicies.filter(
    (r) => broad(u) || r.departmentId === u.departmentId,
  );
  out.timetableFiles = d.timetableFiles.filter(
    (r) =>
      broad(u) ||
      (departmentAccess(u) &&
        d.batches.some((b) => b.id === r.batchId && b.departmentId === u.departmentId)) ||
      (u.role === 'TEACHER' && os.some((o) => o.batchId === r.batchId)) ||
      (u.role === 'STUDENT' && r.batchId === u.batchId),
  );
  for (const table of ['timetable', 'attendance', 'assignments', 'quizzes', 'results', 'materials'])
    out[table] = d[table]
      .filter(
        (r) =>
          ids.has(r.offeringId) &&
          (u.role !== 'STUDENT' ||
            ((!r.studentId || r.studentId === u.id) &&
              (!['assignments', 'quizzes', 'results'].includes(table) || r.published))),
      )
      .map((r) => (table === 'assignments' ? { ...r, allowLate: 0 } : r));
  out.submissions = d.submissions.filter(
    (s) =>
      out.assignments.some((a) => a.id === s.assignmentId) &&
      (u.role !== 'STUDENT' || s.studentId === u.id),
  );
  out.attempts = d.attempts
    .filter(
      (a) =>
        out.quizzes.some((q) => q.id === a.quizId) &&
        (u.role !== 'STUDENT' || a.studentId === u.id),
    )
    .map((a) =>
      u.role === 'STUDENT' && !out.quizzes.find((q) => q.id === a.quizId)?.release
        ? { ...a, score: null }
        : a,
    );
  out.quizzes = out.quizzes.map((q) => ({
    ...q,
    questions: JSON.parse(q.questions).map((v: Row) => {
      if (u.role === 'STUDENT') {
        const { correct, ...rest } = v;
        return rest;
      }
      return v;
    }),
  }));
  out.progress = d.progress.filter(
    (p) =>
      out.materials.some((m) => m.id === p.materialId) &&
      (u.role !== 'STUDENT' || p.studentId === u.id),
  );
  out.announcements = d.announcements.filter(
    (a) =>
      canDeleteAnnouncement(u, a, d) ||
      u.role === 'ADMIN' ||
      a.authorId === u.id ||
      ((broad(u) || !a.departmentId || a.departmentId === u.departmentId) &&
        (broad(u) ||
          !a.batchId ||
          a.batchId === u.batchId ||
          os.some((o) => o.batchId === a.batchId)) &&
        (!a.offeringId || ids.has(a.offeringId)) &&
        (!a.targetRole || a.targetRole === u.role)),
  );
  out.tasks = [];
  out.facultyTasks = (d.facultyTasks || []).filter(
    (t) =>
      permitted(u, 'view_teacherTasks', config) &&
      (u.role === 'ADMIN' ||
        u.role === 'SUPER_ADMIN' ||
        t.userId === u.id ||
        (permitted(u, 'task_assign', config) && (broad(u) || t.departmentId === u.departmentId))),
  );
  if (u.role === 'TEACHER') {
    if (!permitted(u, 'timetable_department', config)) {
      out.timetable = out.timetable.filter((r) =>
        d.offerings.some(
          (o) =>
            o.id === r.offeringId &&
            (o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id)),
        ),
      );
      out.timetableFiles = out.timetableFiles.filter((r) =>
        d.offerings.some(
          (o) =>
            o.batchId === r.batchId &&
            (o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id)),
        ),
      );
    }
    for (const t of ['attendance', 'assignments', 'quizzes', 'materials'])
      out[t] = out[t].filter((r) =>
        d.offerings.some(
          (o) =>
            o.id === r.offeringId &&
            (o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id)),
        ),
      );
    if (!permitted(u, 'results_department', config)) {
      out.results = out.results.filter((r) =>
        d.offerings.some(
          (o) =>
            o.id === r.offeringId &&
            (o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id)),
        ),
      );
      out.resultFiles = out.resultFiles.filter((r) =>
        d.offerings.some(
          (o) =>
            o.id === r.offeringId &&
            (o.teacherId === u.id || (!!o.coTeacherId && o.coTeacherId === u.id)),
        ),
      );
    }
    out.submissions = out.submissions.filter((r) =>
      out.assignments.some((a) => a.id === r.assignmentId),
    );
    out.attempts = out.attempts.filter((r) => out.quizzes.some((a) => a.id === r.quizId));
    out.progress = out.progress.filter((r) => out.materials.some((a) => a.id === r.materialId));
  }
  out.audit = u.role === 'SUPER_ADMIN' ? d.audit.slice(-150).reverse() : [];
  for (const key of [
    'attendance',
    'assignments',
    'quizzes',
    'results',
    'timetable',
    'announcements',
    'tasks',
  ])
    if (!permitted(u, 'view_' + key, config)) out[key] = [];
  out.materials = out.materials.filter((m) =>
    permitted(u, m.kind === 'Course outline' ? 'view_courseOutlines' : 'view_materials', config),
  );
  if (!permitted(u, 'view_assignments', config)) out.submissions = [];
  if (!permitted(u, 'view_quizzes', config)) out.attempts = [];
  if (!permitted(u, 'view_materials', config)) out.progress = [];
  if (!permitted(u, 'view_results', config)) {
    out.resultFiles = [];
    out.assessmentPolicies = [];
  }
  if (!permitted(u, 'view_timetable', config)) out.timetableFiles = [];
  // Keep only minimal user identities needed to label scoped academic records.
  if (!permitted(u, 'view_users', config))
    out.users = out.users.map((v) =>
      v.id === u.id
        ? v
        : {
            id: v.id,
            name: v.name,
            role: v.role,
            departmentId: v.departmentId,
            batchId: v.batchId,
            identifier: v.identifier,
            avatar: v.avatar,
            active: v.active,
            qualifications: v.qualifications,
            bio: v.bio,
            profileLinks: v.profileLinks,
            profileNote: v.profileNote,
            designation: v.designation,
            employmentType: v.employmentType,
          },
    );
  return out;
}
export function overlap(a: Row, b: Row, offerings: Row[]): boolean {
  if (a.id === b.id || a.day !== b.day || a.startTime >= b.endTime || a.endTime <= b.startTime)
    return false;
  const ao = offerings.find((o) => o.id === a.offeringId),
    bo = offerings.find((o) => o.id === b.offeringId);
  return (
    a.room.trim().toLowerCase() === b.room.trim().toLowerCase() ||
    !!(
      ao &&
      bo &&
      ([ao.teacherId, ao.coTeacherId]
        .filter(Boolean)
        .some((id) => [bo.teacherId, bo.coTeacherId].includes(id)) ||
        ao.batchId === bo.batchId)
    )
  );
}
export function attendancePercent(records: Row[]): number | null {
  const counted = records.filter((r) => r.status !== 'Excused');
  return counted.length
    ? Math.round(
        (counted.filter((r) => ['Present', 'Late'].includes(r.status)).length / counted.length) *
          100,
      )
    : null;
}
