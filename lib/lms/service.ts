import { portalEnhancementAction } from './portal-enhancements';
import { canDeleteAnnouncement } from '@/security/announcement-access';
import { rollOrder } from './ordering';
import { extensionAction } from './extensions';
import { facultyAction } from './faculty-tasks';
import { loginReminders } from './reminders';
import { dataQueries } from './queries';
import { validateGrading } from './grading';
import { env } from '@/lib/platform';
import { ensureDatabase } from '@/lib/database';
import { AppError } from '@/security/errors';
export { AppError } from '@/security/errors';
import { Data, Row, tables, roles, uid } from './types';

import { cookies } from 'next/headers';
import { digest, hashPassword } from './password';
import {
  normalizeRolePrivileges,
  privileges as userPrivileges,
  permitted,
  entityPrivilege,
  privilegeLabels,
  isValidPrivilege,
  getDefaultRolePrivileges,
  RolePrivilegesConfig,
} from './access';
import {
  broad,
  manager,
  offeringAllowed,
  studentManageAllowed,
  accountManageAllowed,
  resultsAllowed,
  teachingAllowed,
  scopedData,
  overlap,
} from './policy';

export const db = () => {
  if (!env.DB) throw new AppError('Database is unavailable. Please try again shortly.', 503);
  return env.DB;
};
export const all = async (table: string): Promise<Row[]> =>
  (await db().prepare(`SELECT * FROM "${table}"`).all()).results as Row[];
export const stmt = (sql: string, values: any[] = []) =>
  db()
    .prepare(sql)
    .bind(...values);
export function insert(table: string, row: Row, ignore = false) {
  const keys = Object.keys(row);
  return stmt(
    `INSERT INTO "${table}" (${keys.map((k) => '"' + k + '"').join(',')}) VALUES (${keys.map(() => '?').join(',')})${ignore ? ' ON CONFLICT DO NOTHING' : ''}`,
    keys.map((k) => row[k] ?? null),
  );
}
export const auditStmt = (u: Row, action: string, entity: string, id: string, detail = '') =>
  insert('audit', {
    id: uid(),
    actorId: u.id,
    action,
    entity,
    recordId: id,
    detail,
    createdAt: new Date().toISOString(),
  });
export async function getRolePrivileges(): Promise<RolePrivilegesConfig> {
  const row = await stmt("SELECT value FROM settings WHERE key='role_privileges'").first<{
    value: string;
  }>();
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (parsed && Array.isArray(parsed.privileges) && parsed.rolePermissions)
        return normalizeRolePrivileges(parsed);
    } catch (e) {
      console.error('Failed to parse role_privileges', e);
    }
  }
  return getDefaultRolePrivileges();
}
export async function context(loadData = true, allowPasswordChange = false) {
  await ensureDatabase();
  if (!(await stmt("SELECT value FROM settings WHERE key='college_auth_v2'").first()))
    throw new AppError('First administrator setup is required. Open /setup to finish.', 428);
  const auth = { userId: 'college-session', email: '' };
  const jar = await cookies();
  const session = jar.get('lcps_session')?.value;
  const found = session
    ? await stmt('SELECT userId,remindersSeen FROM loginSessions WHERE tokenHash=? AND expires>?', [
        await digest(session),
        Date.now(),
      ]).first<Row>()
    : null;
  const actual = found
    ? await stmt('SELECT * FROM users WHERE id=? AND active=1 AND demo=0', [
        found.userId,
      ]).first<Row>()
    : null;
  if (!actual || !roles.includes(actual.role))
    throw new AppError('Please sign in with your college username and password.', 401);
  actual.passwordChangeRequired = actual.passwordChangeRequired ? 1 : 0;
  if (actual.passwordChangeRequired && !allowPasswordChange)
    throw new AppError('Change your password before using the portal.', 403);
  const rolePrivileges = await getRolePrivileges();
  actual.accessConfig = rolePrivileges;
  const isOwner = actual.role === 'ADMIN';
  const data: Data = {};
  const loaded = loadData ? await db().batch(dataQueries(actual)) : [];
  tables.forEach((t, i) => {
    data[t] = loadData ? (loaded[i].results as Row[]) : [];
  });
  for (const a of data.attempts.filter(
    (a) => !a.submittedAt && Date.now() > Date.parse(a.deadline),
  )) {
    const quiz = data.quizzes.find((q) => q.id === a.quizId);
    if (quiz) {
      const answers = JSON.parse(a.answers);
      const score = JSON.parse(quiz.questions).reduce(
        (total: number, q: Row) => total + (answers[q.id] === q.correct ? q.marks : 0),
        0,
      );
      const submittedAt = new Date().toISOString();
      await stmt('UPDATE attempts SET submittedAt=?,score=? WHERE id=? AND submittedAt IS NULL', [
        submittedAt,
        score,
        a.id,
      ]).run();
      a.submittedAt = submittedAt;
      a.score = score;
    }
  }
  const user = { ...actual };
  user.accessConfig = rolePrivileges;
  return {
    auth,
    isOwner,
    actual,
    user,
    data,
    rolePrivileges,
    sessionHash: session ? await digest(session) : '',
    remindersSeen: !!found?.remindersSeen,
  };
}
export type Context = Awaited<ReturnType<typeof context>>;
export function payload(c: Context) {
  return {
    user: c.user,
    owner: c.isOwner,
    actualName: c.actual.name,
    demo: !!c.user.demo,
    demoUsers: c.isOwner
      ? c.data.users
          .filter((u) => u.demo && u.active)
          .map((u) => ({ id: u.id, name: u.name, role: u.role }))
      : [],
    data: scopedData(c.user, c.data, c.rolePrivileges),
    loginReminder: !c.remindersSeen,
    reminders: loginReminders(c.user, scopedData(c.user, c.data, c.rolePrivileges)),
    rolePrivileges: c.rolePrivileges,
    serverTime: new Date().toISOString(),
  };
}
const specs: Record<string, string[]> = {
  departments: ['name', 'code', 'active'],
  programs: ['name', 'departmentId', 'active'],
  sessions: ['name', 'active'],
  batches: ['name', 'departmentId', 'programId', 'sessionId', 'semester', 'active'],
  users: [
    'name',
    'username',
    'email',
    'role',
    'departmentId',
    'batchId',
    'identifier',
    'phone',
    'employmentType',
    'designation',
    'office',
    'schedule',
    'active',
  ],
  subjects: ['name', 'code', 'departmentId', 'credits', 'active'],
  offerings: ['subjectId', 'batchId', 'teacherId', 'coTeacherId', 'active'],
  enrollments: ['studentId', 'offeringId', 'active'],
  hodScopes: ['userId', 'batchId'],
  timetable: ['offeringId', 'day', 'startTime', 'endTime', 'room'],
  timetableFiles: ['batchId', 'fileId', 'mime', 'createdAt'],
  attendance: ['offeringId', 'studentId', 'date', 'status', 'reason', 'remarks'],
  assignments: [
    'offeringId',
    'title',
    'instructions',
    'dueDate',
    'maxMarks',
    'allowLate',
    'published',
    'fileId',
  ],
  quizzes: [
    'offeringId',
    'title',
    'topic',
    'opensAt',
    'closesAt',
    'duration',
    'questions',
    'published',
    'release',
    'fileId',
  ],
  results: ['offeringId', 'studentId', 'title', 'marks', 'maxMarks', 'published', 'feedback'],
  announcements: ['title', 'body', 'departmentId', 'batchId', 'offeringId', 'targetRole'],
  materials: ['offeringId', 'title', 'kind', 'url', 'fileId'],
  tasks: ['userId', 'title', 'dueDate', 'status', 'notes'],
};
const required: Record<string, string[]> = {
  departments: ['name', 'code'],
  programs: ['name', 'departmentId'],
  sessions: ['name'],
  batches: ['name', 'departmentId', 'programId', 'sessionId', 'semester'],
  users: ['name', 'username', 'role'],
  subjects: ['name', 'code', 'departmentId', 'credits'],
  offerings: ['subjectId', 'batchId', 'teacherId'],
  enrollments: ['studentId', 'offeringId'],
  hodScopes: ['userId', 'batchId'],
  timetable: ['offeringId', 'day', 'startTime', 'endTime', 'room'],
  attendance: ['offeringId', 'studentId', 'date', 'status'],
  assignments: ['offeringId', 'title', 'instructions', 'dueDate', 'maxMarks'],
  quizzes: ['offeringId', 'title'],
  results: ['offeringId', 'studentId', 'title', 'marks', 'maxMarks'],
  announcements: ['title', 'body'],
  materials: ['offeringId', 'title', 'kind'],
  tasks: ['userId', 'title', 'dueDate', 'status'],
};
function assert(
  ok: any,
  message = 'You do not have permission to perform this action.',
  status = 403,
): asserts ok {
  if (!ok) throw new AppError(message, status);
}
function number(value: any, min: number, max: number, name: string) {
  assert(
    Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max,
    `${name} must be between ${min} and ${max}.`,
    400,
  );
  return Number(value);
}
function date(value: any, name: string) {
  assert(
    typeof value === 'string' && Number.isFinite(Date.parse(value)),
    `${name} is invalid.`,
    400,
  );
}
function relation(d: Data, t: string, id: any) {
  const r = d[t]?.find((x) => x.id === id);
  assert(r, `Select a valid ${t} record.`, 400);
  return r!;
}
function validate(c: Context, t: string, r: Row, previous?: Row) {
  const u = c.user,
    d = c.data;
  for (const k of required[t] || [])
    assert(r[k] !== null && r[k] !== undefined && r[k] !== '', `${k} is required.`, 400);
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string')
      assert(
        v.length <=
          (['body', 'instructions', 'questions', 'notes', 'feedback'].includes(k) ? 30000 : 1000),
        `${k} is too long.`,
        400,
      );
  }
  const dep = r.departmentId ? relation(d, 'departments', r.departmentId) : null;
  const batch = r.batchId ? relation(d, 'batches', r.batchId) : null;
  if (batch && dep)
    assert(batch.departmentId === dep.id, 'Batch and department do not match.', 400);
  let off: Row | undefined;
  if (r.offeringId) {
    off = relation(d, 'offerings', r.offeringId);
    assert(offeringAllowed(u, off, d));
  }
  if (['departments', 'programs', 'sessions'].includes(t)) {
    assert(permitted(u, 'college_setup', c.rolePrivileges));
    if (t === 'departments' && previous && r.active === 0)
      assert(
        !d.users.some((v) => v.active && v.departmentId === r.id),
        'Reassign or deactivate department users first.',
        400,
      );
  }
  if (t === 'batches') {
    assert(manager(u) && (broad(u) || r.departmentId === u.departmentId));
    const p = relation(d, 'programs', r.programId);
    relation(d, 'sessions', r.sessionId);
    assert(p.departmentId === r.departmentId, 'Program and department do not match.', 400);
    r.semester = number(r.semester, 1, 12, 'Semester');
    assert(Number.isInteger(r.semester), 'Semester must be a whole number.', 400);
  }
  if (t === 'users') {
    if (r.role === 'TEACHER') {
      if (!previous || previous.role !== 'TEACHER' || r.employmentType)
        assert(
          ['Visiting', 'Permanent'].includes(r.employmentType),
          'Select Visiting or Permanent for the teacher.',
          400,
        );
    } else r.employmentType = null;
    assert(accountManageAllowed(u, r));
    if (previous) assert(accountManageAllowed(u, previous));
    assert(roles.includes(r.role), 'Select a valid role.', 400);
    if (!permitted(u, 'senior_accounts', c.rolePrivileges))
      assert(
        ['STUDENT', 'TEACHER'].includes(r.role),
        'Only an administrator can assign this role.',
        403,
      );
    if (['STUDENT', 'TEACHER', 'HOD'].includes(r.role)) assert(dep, 'Department is required.', 400);
    if (r.role === 'STUDENT') assert(batch, 'Student batch is required.', 400);
    else r.batchId = null;
    if (r.email) {
      assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email), 'Enter a valid email.', 400);
      r.email = r.email.toLowerCase();
    }
    if (previous && previous.id === c.actual.id)
      assert(
        r.active && r.role === previous.role && r.email === previous.email,
        'You cannot deactivate yourself or change your own access identity.',
        400,
      );
    if (previous?.role === 'ADMIN' && (!r.active || r.role !== 'ADMIN'))
      assert(
        d.users.some((v) => v.id !== r.id && v.role === 'ADMIN' && v.active && !v.demo),
        'Keep at least one active non-demo administrator.',
        400,
      );
    if (previous && previous.batchId !== r.batchId)
      assert(
        !d.enrollments.some((e) => e.studentId === r.id && e.active),
        'Archive existing enrollments before moving this student to another batch.',
        400,
      );
    if (
      previous &&
      previous.role !== r.role &&
      d.offerings.some((o) => o.teacherId === r.id || (!!o.coTeacherId && o.coTeacherId === r.id))
    )
      assert(false, 'Reassign teaching subjects before changing this role.', 400);
    if (
      previous?.departmentId !== r.departmentId &&
      d.offerings.some((o) => o.teacherId === r.id || (!!o.coTeacherId && o.coTeacherId === r.id))
    )
      assert(!previous, 'Reassign this teacher’s subjects before changing their department.', 400);
  }
  if (t === 'subjects') {
    assert(manager(u) && (broad(u) || r.departmentId === u.departmentId));
    r.credits = number(r.credits, 1, 12, 'Credits');
  }
  if (t === 'offerings') {
    assert(
      permitted(u, 'student_enrollment', c.rolePrivileges),
      'Student enrollment access is disabled.',
    );
    const s = relation(d, 'subjects', r.subjectId),
      b = relation(d, 'batches', r.batchId),
      teacher = relation(d, 'users', r.teacherId);
    assert(manager(u) && (broad(u) || b.departmentId === u.departmentId));
    assert(s.departmentId === b.departmentId, 'Subject and batch departments must match.', 400);
    assert(
      ['TEACHER', 'HOD'].includes(teacher.role) &&
        teacher.active &&
        teacher.departmentId === b.departmentId,
      'Choose an active teacher from the same department.',
      400,
    );
    assert(
      !d.offerings.some(
        (o) => o.id !== r.id && o.subjectId === r.subjectId && o.batchId === r.batchId,
      ),
      'This class already has that subject offering.',
      400,
    );
    if (previous && (r.batchId !== previous.batchId || r.subjectId !== previous.subjectId))
      assert(
        !d.enrollments.some((e) => e.offeringId === r.id) &&
          !d.assignments.some((a) => a.offeringId === r.id) &&
          !d.attendance.some((a) => a.offeringId === r.id),
        'Create a new offering to preserve the existing class history.',
        400,
      );
    if (r.coTeacherId) {
      const second = relation(d, 'users', r.coTeacherId);
      assert(
        r.coTeacherId !== r.teacherId &&
          ['TEACHER', 'HOD'].includes(second.role) &&
          second.active &&
          second.departmentId === b.departmentId,
        'Choose a different active teacher from the same department.',
        400,
      );
    }
    if (
      previous &&
      (r.teacherId !== previous.teacherId || r.coTeacherId !== previous.coTeacherId)
    ) {
      const virtual = d.offerings.map((o) => (o.id === r.id ? r : o));
      assert(
        !d.timetable.some(
          (a) => a.offeringId === r.id && d.timetable.some((b) => overlap(a, b, virtual)),
        ),
        'Teacher reassignment creates a timetable conflict.',
        400,
      );
    }
  }
  if (t === 'enrollments') {
    const st = relation(d, 'users', r.studentId);
    assert(studentManageAllowed(u, st, d));
    assert(
      st.active && st.batchId === off?.batchId,
      'Student must belong to the subject’s batch.',
      400,
    );
    assert(
      !d.enrollments.some(
        (e) =>
          e.id !== r.id &&
          e.studentId === r.studentId &&
          e.offeringId === r.offeringId &&
          e.active === 1,
      ),
      'Student is already enrolled in this offering.',
      400,
    );
  }
  if (t === 'hodScopes') {
    assert(permitted(u, 'senior_accounts', c.rolePrivileges));
    const h = relation(d, 'users', r.userId);
    assert(
      h.role === 'HOD' && h.departmentId === batch?.departmentId,
      'HOD and batch departments must match.',
      400,
    );
  }
  if (t === 'timetable') {
    assert(manager(u));
    assert(
      !(d.scheduleEvents || []).some(
        (e) =>
          e.day === r.day &&
          e.startTime < r.endTime &&
          r.startTime < e.endTime &&
          (e.batchId === off?.batchId ||
            (e.room && e.room.trim().toLowerCase() === r.room?.trim().toLowerCase())),
      ),
      'This time conflicts with a break or other scheduled activity.',
      409,
    );
    assert(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(
        r.day,
      ),
      'Invalid day.',
      400,
    );
    assert(
      /^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(r.endTime) &&
        r.endTime > r.startTime,
      'Use a valid time range.',
      400,
    );
    assert(
      !d.timetable.some((x) => overlap(r, x, d.offerings)),
      'This time conflicts with the teacher, class, or room.',
      409,
    );
  }
  if (['attendance', 'assignments', 'quizzes', 'materials'].includes(t))
    assert(off && teachingAllowed(u, off));
  if (t === 'results') assert(off && resultsAllowed(u, off, d));
  if (['attendance', 'results'].includes(t)) {
    relation(d, 'users', r.studentId);
    assert(
      d.enrollments.some(
        (e) => e.studentId === r.studentId && e.offeringId === r.offeringId && e.active,
      ),
      'Student is not enrolled in this subject.',
      400,
    );
  }
  if (t === 'attendance') {
    assert(
      ['Present', 'Absent', 'Late'].includes(r.status) ||
        (previous?.status === 'Excused' && r.status === 'Excused'),
      'Invalid attendance status.',
      400,
    );
    assert(
      !r.remarks || (typeof r.remarks === 'string' && r.remarks.length <= 1000),
      'Remarks are too long.',
      400,
    );
    r.remarks = r.status === 'Late' ? r.remarks || null : null;
    date(r.date, 'Attendance date');
    assert(
      /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date <= new Date().toISOString().slice(0, 10),
      'Attendance cannot be recorded for a future date.',
      400,
    );
    if (previous && previous.status !== r.status)
      assert(r.reason?.trim(), 'Give a reason for the attendance correction.', 400);
    r.recordedBy = u.id;
  }
  if (['assignments', 'results'].includes(t)) {
    r.maxMarks = number(r.maxMarks, 1, 1000, 'Maximum marks');
    if (t === 'results') r.marks = number(r.marks, 0, r.maxMarks, 'Marks');
  }
  if (t === 'assignments') date(r.dueDate, 'Due date');
  if (t === 'quizzes') {
    date(r.opensAt, 'Opening time');
    date(r.closesAt, 'Closing time');
    assert(
      Date.parse(r.closesAt) > Date.parse(r.opensAt),
      'Closing time must follow opening time.',
      400,
    );
    r.duration = 1;
    r.questions = '[]';
  }
  if (t === 'announcements') {
    assert(
      manager(u) ||
        u.role === 'TEACHER' ||
        ['TREASURER', 'EXAMINATION_CONTROLLER', 'REGISTRAR'].includes(u.role),
    );
    if (u.role === 'TEACHER')
      assert(off && (off.teacherId === u.id || (!!off.coTeacherId && off.coTeacherId === u.id)));
    if (u.role === 'HOD')
      assert(
        r.departmentId === u.departmentId || off || batch?.departmentId === u.departmentId,
        'Select your department, class, or subject audience.',
        400,
      );
    if (r.targetRole) assert(roles.includes(r.targetRole), 'Invalid target role.', 400);
    if (previous) assert(broad(u) || previous.authorId === u.id);
  }
  if (t === 'materials') {
    if (r.kind === 'Course outline')
      assert(permitted(u, 'view_courseOutlines'), 'Course outline access is disabled.');
    assert(
      ['Link', 'Video', 'Document', 'Course outline'].includes(r.kind),
      'Select a material type.',
      400,
    );
    assert(r.url || r.fileId, 'Provide a link or upload a document.', 400);
    if (r.url) {
      let url;
      try {
        url = new URL(r.url);
      } catch {
        throw new AppError('Enter a valid URL.');
      }
      assert(url.protocol === 'https:', 'Use an HTTPS resource URL.', 400);
    }
  }
  if (t === 'tasks') assert(false, 'Office tasks have been retired.');
  for (const k of ['active', 'published', 'allowLate', 'release']) if (k in r) r[k] = r[k] ? 1 : 0;
}
export async function save(c: Context, t: string, input: Row) {
  assert(t !== 'tasks', 'Office tasks have been retired.');
  assert(permitted(c.user, entityPrivilege(t), c.rolePrivileges));
  assert(specs[t], 'Unknown entity.', 400);
  assert(t !== 'timetableFiles', 'Timetable files can only be removed, not edited.', 400);
  const d = c.data;
  const previous = input.id ? c.data[t]?.find((x) => x.id === input.id) : undefined;
  if (input.id) assert(previous, 'Record not found.', 404);
  const visible = scopedData(c.user, c.data, c.rolePrivileges)[t] || [];
  if (previous) assert(visible.some((v) => v.id === previous.id));
  const r: Row = { ...(previous || {}), id: previous?.id || uid() };
  delete r.enrollmentCount;
  for (const k of specs[t]) {
    if (k in input) {
      let value = input[k];
      if (typeof value === 'string') value = value.trim();
      r[k] = value === '' ? null : value;
    }
  }
  if (!previous) {
    if (specs[t].includes('active')) r.active = r.active ?? 1;
    for (const k of ['published', 'allowLate', 'release'])
      if (specs[t].includes(k)) r[k] = r[k] ?? 0;
    if (t === 'assignments' && !('published' in input)) r.published = 1;
    if (t === 'users') {
      r.demo = 0;
      r.createdAt = new Date().toISOString();
    }
    if (t === 'announcements') {
      r.authorId = c.user.id;
      r.createdAt = new Date().toISOString();
    }
  }
  if (t === 'quizzes') {
    const now = new Date().toISOString();
    r.opensAt = r.opensAt || now;
    r.closesAt = r.closesAt || new Date(Date.now() + 3650 * 86400000).toISOString();
    r.duration = 1;
    r.questions = '[]';
  }
  validate(c, t, r, previous);
  if (['assignments', 'quizzes', 'materials', 'results', 'timetable'].includes(t))
    r.updatedBy = c.user.id;
  if (
    t === 'users' &&
    previous &&
    (previous.role !== r.role || previous.departmentId !== r.departmentId)
  )
    r.responsibilities = '[]';
  if (
    t === 'results' &&
    previous?.published &&
    ['marks', 'maxMarks', 'published', 'title', 'studentId', 'offeringId'].some(
      (k) => r[k] !== previous[k],
    )
  )
    assert(
      typeof input.correctionReason === 'string' &&
        input.correctionReason.trim().length >= 5 &&
        input.correctionReason.length <= 1000,
      'Explain the correction to this published result (at least 5 characters).',
      400,
    );
  const extra = [];
  if (t === 'users') {
    assert(
      /^[a-zA-Z0-9_.-]{3,60}$/.test(r.username),
      'Username must be 3–60 letters, numbers, dots, underscores or hyphens.',
      400,
    );
    r.username = r.username.toLowerCase();
    if ('permissions' in input) {
      assert(permitted(c.user, 'manage_access', c.rolePrivileges));
      let grants;
      try {
        grants =
          typeof input.permissions === 'string' ? JSON.parse(input.permissions) : input.permissions;
      } catch {
        throw new AppError('Invalid privileges.');
      }
      assert(
        grants && typeof grants === 'object' && !Array.isArray(grants),
        'Invalid privileges.',
        400,
      );
      for (const [k, v] of Object.entries(grants))
        assert(
          isValidPrivilege(k, c.rolePrivileges) && typeof v === 'boolean',
          'Invalid privilege.',
          400,
        );
      r.permissions = JSON.stringify(grants);
    }
    if (!previous || input.password) {
      r.passwordChangeRequired = 1;
      assert(
        !previous || permitted(c.user, 'reset_passwords', c.rolePrivileges),
        'Only an administrator can reset passwords.',
      );
      assert(previous?.id !== c.user.id, 'Use Change password for your own account.', 400);
      let hash;
      try {
        hash = await hashPassword(input.password);
      } catch (e) {
        throw new AppError((e as Error).message);
      }
      extra.push(
        stmt(
          'INSERT INTO credentials(userId,hash) VALUES(?,?) ON CONFLICT(userId) DO UPDATE SET hash=excluded.hash',
          [r.id, hash],
        ),
      );
    }
    if (previous) extra.push(stmt('DELETE FROM loginSessions WHERE userId=?', [r.id]));
    if (!previous && r.role === 'STUDENT' && r.batchId)
      for (const course of d.offerings.filter((o) => o.batchId === r.batchId && o.active !== 0))
        extra.push(
          insert(
            'enrollments',
            { id: uid(), studentId: r.id, offeringId: course.id, active: 1 },
            true,
          ),
        );
  }
  if (t === 'offerings' && !previous)
    for (const st of d.users.filter(
      (x) => x.role === 'STUDENT' && x.active && x.batchId === r.batchId,
    ))
      extra.push(
        insert('enrollments', { id: uid(), studentId: st.id, offeringId: r.id, active: 1 }, true),
      );
  if (r.fileId) {
    const file = await stmt('SELECT * FROM files WHERE id=?', [r.fileId]).first<Row>();
    assert(
      file && (file.ownerId === c.user.id || previous?.fileId === r.fileId),
      'Choose one of your uploaded files.',
      400,
    );
  }
  const keys = Object.keys(r).filter((k) => k !== 'id');
  const write = previous
    ? stmt(`UPDATE "${t}" SET ${keys.map((k) => '"' + k + '"=?').join(',')} WHERE id=?`, [
        ...keys.map((k) => r[k] ?? null),
        r.id,
      ])
    : insert(t, r);
  await db().batch([
    write,
    ...extra,
    auditStmt(
      c.user,
      previous ? 'update' : 'create',
      t,
      r.id,
      t === 'attendance'
        ? r.reason || ''
        : t === 'results'
          ? JSON.stringify({
              before: previous
                ? {
                    marks: previous.marks,
                    maxMarks: previous.maxMarks,
                    published: previous.published,
                  }
                : null,
              after: { marks: r.marks, maxMarks: r.maxMarks, published: r.published },
              reason: input.correctionReason || '',
            })
          : '',
    ),
  ]);
  return r.id;
}
export async function remove(c: Context, t: string, id: string) {
  const u = c.user;
  assert(t !== 'tasks', 'Office tasks have been retired.');
  if (t === 'enrollments')
    assert(
      permitted(u, 'student_enrollment', c.rolePrivileges),
      'Student enrollment access is disabled.',
    );
  assert(t === 'announcements' || permitted(u, entityPrivilege(t), c.rolePrivileges));
  assert(specs[t], 'Unknown entity.', 400);
  const r = c.data[t]?.find((x) => x.id === id);
  assert(r, 'Record not found.', 404);
  if (t === 'announcements')
    assert(
      canDeleteAnnouncement(u, r, c.data),
      'Only the author, administrator or department HOD can delete this announcement.',
    );
  else assert(scopedData(u, c.data, c.rolePrivileges)[t]?.some((x) => x.id === id));
  if (t === 'timetable')
    assert(
      ['ADMIN', 'PRINCIPAL'].includes(u.role) ||
        c.data.batches.some(
          (b) =>
            b.departmentId === u.departmentId &&
            c.data.offerings.some((o) => o.batchId === b.id && o.id === r.offeringId),
        ),
    );
  if (t === 'users') {
    assert(
      accountManageAllowed(u, r),
      'You can only remove students or teachers in your department.',
    );
    if (u.role === 'HOD')
      assert(['STUDENT', 'TEACHER'].includes(r.role) && r.departmentId === u.departmentId);
    if (r.role === 'ADMIN' && r.active && !r.demo)
      assert(
        c.data.users.some((x) => x.id !== r.id && x.role === 'ADMIN' && x.active && !x.demo),
        'Keep at least one active non-demo administrator.',
        400,
      );
  } else if ('active' in r && u.role !== 'ADMIN' && !(u.role === 'HOD' && t === 'users')) {
    await save(c, t, { ...r, active: 0 });
    return;
  }
  if (['assignments', 'quizzes', 'materials', 'attendance'].includes(t)) {
    const offering = c.data.offerings.find((x) => x.id === r.offeringId);
    assert(offering && teachingAllowed(u, offering));
  }
  if (t === 'results')
    assert(
      c.data.offerings.some((o) => o.id === r.offeringId && resultsAllowed(u, o, c.data)),
      'You may only manage results within your authorized department or subjects.',
    );
  if (t === 'attendance')
    assert(u.role === 'ADMIN', 'Attendance records must be corrected, not deleted.');
  const writes: ReturnType<typeof stmt>[] = [];
  let timetableFileId: string | null = null;
  if (t === 'timetableFiles') {
    assert(permitted(u, 'timetable', c.rolePrivileges));
    const batch = c.data.batches.find((x) => x.id === r.batchId);
    assert(broad(u) || batch?.departmentId === u.departmentId);
    const file = await stmt('SELECT * FROM files WHERE id=?', [r.fileId]).first<Row>();
    if (file) {
      assert(file.purpose === 'timetable', 'The selected file is not a timetable.', 400);
      const storage = env.fileStorage(file.storageProvider);
      if (!storage)
        throw new AppError('File storage is unavailable. The timetable was not deleted.', 503);
      await storage.delete(file.storageKey || file.id);
      timetableFileId = file.id;
    }
  }
  const byOffering = (offeringId: string) => {
    const assignmentIds = c.data.assignments
      .filter((x) => x.offeringId === offeringId)
      .map((x) => x.id);
    const quizIds = c.data.quizzes.filter((x) => x.offeringId === offeringId).map((x) => x.id);
    const materialIds = c.data.materials
      .filter((x) => x.offeringId === offeringId)
      .map((x) => x.id);
    if (assignmentIds.length)
      writes.push(
        stmt(
          `DELETE FROM submissions WHERE assignmentId IN (${assignmentIds.map(() => '?').join(',')})`,
          assignmentIds,
        ),
      );
    if (quizIds.length)
      writes.push(
        stmt(`DELETE FROM attempts WHERE quizId IN (${quizIds.map(() => '?').join(',')})`, quizIds),
      );
    if (materialIds.length)
      writes.push(
        stmt(
          `DELETE FROM progress WHERE materialId IN (${materialIds.map(() => '?').join(',')})`,
          materialIds,
        ),
      );
    for (const table of [
      'resultFiles',
      'timetable',
      'attendance',
      'results',
      'assignments',
      'quizzes',
      'materials',
      'enrollments',
    ])
      writes.push(stmt(`DELETE FROM "${table}" WHERE offeringId=?`, [offeringId]));
    writes.push(stmt('DELETE FROM offerings WHERE id=?', [offeringId]));
  };
  const byUser = async (userId: string) => {
    writes.push(stmt('DELETE FROM facultyTasks WHERE userId=? OR assignedBy=?', [userId, userId]));
    writes.push(stmt('UPDATE offerings SET coTeacherId=NULL WHERE coTeacherId=?', [userId]));
    for (const offering of c.data.offerings.filter((x) => x.teacherId === userId))
      byOffering(offering.id);
    writes.push(
      stmt('DELETE FROM submissions WHERE studentId=?', [userId]),
      stmt('DELETE FROM attempts WHERE studentId=?', [userId]),
      stmt('DELETE FROM progress WHERE studentId=?', [userId]),
    );
    for (const table of [
      'attendance',
      'results',
      'enrollments',
      'hodScopes',
      'tasks',
      'announcements',
    ])
      writes.push(
        stmt(
          table === 'attendance'
            ? 'DELETE FROM attendance WHERE studentId=? OR recordedBy=?'
            : table === 'announcements'
              ? 'DELETE FROM announcements WHERE authorId=?'
              : `DELETE FROM "${table}" WHERE ${table === 'results' || table === 'enrollments' ? 'studentId' : table === 'hodScopes' ? 'userId' : table === 'tasks' ? 'userId' : 'studentId'}=?`,
          table === 'attendance' ? [userId, userId] : [userId],
        ),
      );
    const ownedFiles = (
      await stmt('SELECT id FROM files WHERE ownerId=?', [userId]).all<Row>()
    ).results.map((f) => f.id);
    if (ownedFiles.length) {
      for (const table of ['timetableFiles', 'resultFiles', 'assessmentPolicies'])
        writes.push(
          stmt(
            `DELETE FROM "${table}" WHERE fileId IN (${ownedFiles.map(() => '?').join(',')})`,
            ownedFiles,
          ),
        );
      writes.push(
        stmt(`DELETE FROM files WHERE id IN (${ownedFiles.map(() => '?').join(',')})`, ownedFiles),
      );
    }
    writes.push(
      stmt('DELETE FROM credentials WHERE userId=?', [userId]),
      stmt('DELETE FROM loginSessions WHERE userId=?', [userId]),
      stmt('DELETE FROM previews WHERE userId=?', [userId]),
      stmt('DELETE FROM users WHERE id=?', [userId]),
    );
  };
  if (t === 'offerings') byOffering(id);
  else if (t === 'subjects') {
    for (const offering of c.data.offerings.filter((x) => x.subjectId === id))
      byOffering(offering.id);
    writes.push(stmt('DELETE FROM subjects WHERE id=?', [id]));
  } else if (t === 'users') await byUser(id);
  else if (t === 'assignments') {
    writes.push(
      stmt('DELETE FROM submissions WHERE assignmentId=?', [id]),
      stmt('DELETE FROM assignments WHERE id=?', [id]),
    );
  } else if (t === 'quizzes') {
    writes.push(
      stmt('DELETE FROM attempts WHERE quizId=?', [id]),
      stmt('DELETE FROM quizzes WHERE id=?', [id]),
    );
  } else if (t === 'materials') {
    writes.push(
      stmt('DELETE FROM progress WHERE materialId=?', [id]),
      stmt('DELETE FROM materials WHERE id=?', [id]),
    );
  } else if (t === 'batches') {
    for (const st of c.data.users.filter((x) => x.batchId === id)) await byUser(st.id);
    for (const offering of c.data.offerings.filter((x) => x.batchId === id))
      byOffering(offering.id);
    writes.push(
      stmt('DELETE FROM hodScopes WHERE batchId=?', [id]),
      stmt('DELETE FROM timetableFiles WHERE batchId=?', [id]),
      stmt('DELETE FROM batches WHERE id=?', [id]),
    );
  } else if (t === 'programs') {
    for (const batch of c.data.batches.filter((x) => x.programId === id)) {
      for (const st of c.data.users.filter((x) => x.batchId === batch.id)) await byUser(st.id);
      for (const offering of c.data.offerings.filter((x) => x.batchId === batch.id))
        byOffering(offering.id);
      writes.push(
        stmt('DELETE FROM hodScopes WHERE batchId=?', [batch.id]),
        stmt('DELETE FROM timetableFiles WHERE batchId=?', [batch.id]),
        stmt('DELETE FROM batches WHERE id=?', [batch.id]),
      );
    }
    writes.push(stmt('DELETE FROM programs WHERE id=?', [id]));
  } else if (t === 'sessions') {
    for (const batch of c.data.batches.filter((x) => x.sessionId === id)) {
      for (const st of c.data.users.filter((x) => x.batchId === batch.id)) await byUser(st.id);
      for (const offering of c.data.offerings.filter((x) => x.batchId === batch.id))
        byOffering(offering.id);
      writes.push(
        stmt('DELETE FROM hodScopes WHERE batchId=?', [batch.id]),
        stmt('DELETE FROM timetableFiles WHERE batchId=?', [batch.id]),
        stmt('DELETE FROM batches WHERE id=?', [batch.id]),
      );
    }
    writes.push(stmt('DELETE FROM sessions WHERE id=?', [id]));
  } else if (t === 'departments') {
    for (const st of c.data.users.filter((x) => x.departmentId === id)) await byUser(st.id);
    for (const batch of c.data.batches.filter((x) => x.departmentId === id)) {
      for (const st of c.data.users.filter((x) => x.batchId === batch.id)) await byUser(st.id);
      for (const offering of c.data.offerings.filter((x) => x.batchId === batch.id))
        byOffering(offering.id);
      writes.push(
        stmt('DELETE FROM hodScopes WHERE batchId=?', [batch.id]),
        stmt('DELETE FROM timetableFiles WHERE batchId=?', [batch.id]),
        stmt('DELETE FROM batches WHERE id=?', [batch.id]),
      );
    }
    for (const subject of c.data.subjects.filter((x) => x.departmentId === id)) {
      for (const offering of c.data.offerings.filter((x) => x.subjectId === subject.id))
        byOffering(offering.id);
      writes.push(stmt('DELETE FROM subjects WHERE id=?', [subject.id]));
    }
    writes.push(
      stmt('DELETE FROM assessmentPolicies WHERE departmentId=?', [id]),
      stmt('DELETE FROM programs WHERE departmentId=?', [id]),
      stmt('DELETE FROM departments WHERE id=?', [id]),
    );
  } else if (t === 'timetableFiles')
    writes.push(stmt('DELETE FROM timetableFiles WHERE id=?', [id]));
  else if (t === 'resultFiles') writes.push(stmt('DELETE FROM resultFiles WHERE id=?', [id]));
  else if (t === 'assessmentPolicies')
    writes.push(stmt('DELETE FROM assessmentPolicies WHERE id=?', [id]));
  else writes.push(stmt(`DELETE FROM "${t}" WHERE id=?`, [id]));
  if (timetableFileId) writes.push(stmt('DELETE FROM files WHERE id=?', [timetableFileId]));
  writes.push(auditStmt(u, 'delete', t, id));
  await db().batch(writes);
}
export async function action(c: Context, body: Row) {
  const u = c.user,
    d = c.data;
  const enhancement = await portalEnhancementAction(c, body);
  if (enhancement !== undefined) return enhancement;
  if (
    [
      'personalSave',
      'personalDelete',
      'coursePolicySave',
      'managementSave',
      'managementDelete',
      'deleteResultSheet',
    ].includes(body.action)
  )
    return extensionAction(c, body);
  if (
    [
      'createFacultyTask',
      'submitFacultyTask',
      'cancelFacultyTask',
      'setResponsibilities',
      'ackLoginReminder',
    ].includes(body.action)
  )
    return facultyAction(c, body);
  if (body.action === 'save') return save(c, body.entity, body.record || {});
  if (body.action === 'remove') return remove(c, body.entity, body.id);
  if (body.action === 'assignSemesterSubjects') {
    assert(
      permitted(u, 'student_enrollment', c.rolePrivileges),
      'Student enrollment access is disabled.',
    );
    assert(manager(u) && permitted(u, entityPrivilege('offerings'), c.rolePrivileges));
    const batch = relation(d, 'batches', body.batchId);
    assert(
      broad(u) || batch.departmentId === u.departmentId,
      'You can only assign subjects within your department.',
      403,
    );
    assert(batch.active !== 0, 'Activate this batch before assigning semester subjects.', 400);
    assert(
      Array.isArray(body.subjects) && body.subjects.length > 0 && body.subjects.length <= 100,
      'Select between 1 and 100 subjects.',
      400,
    );
    const subjectIds = new Set<string>(),
      assignments: Row[] = [];
    for (const item of body.subjects) {
      assert(
        item && typeof item.subjectId === 'string' && typeof item.teacherId === 'string',
        'Choose a subject and teacher for every assignment.',
        400,
      );
      assert(!subjectIds.has(item.subjectId), 'A subject can only be selected once.', 400);
      subjectIds.add(item.subjectId);
      const subject = relation(d, 'subjects', item.subjectId),
        teacher = relation(d, 'users', item.teacherId);
      assert(
        subject.active !== 0 && subject.departmentId === batch.departmentId,
        'Choose an active subject from the batch department.',
        400,
      );
      assert(
        ['TEACHER', 'HOD'].includes(teacher.role) &&
          teacher.active &&
          teacher.departmentId === batch.departmentId,
        'Choose an active teacher from the same department.',
        400,
      );
      assert(
        !d.offerings.some(
          (offering) => offering.batchId === batch.id && offering.subjectId === subject.id,
        ),
        'This semester already has one or more selected subjects. Refresh and choose only unassigned subjects.',
        409,
      );
      if (item.coTeacherId) {
        const co = relation(d, 'users', item.coTeacherId);
        assert(
          co.id !== teacher.id &&
            co.active &&
            ['TEACHER', 'HOD'].includes(co.role) &&
            co.departmentId === batch.departmentId,
          'Choose a different active second teacher from the same department.',
          400,
        );
      }
      assignments.push({
        id: uid(),
        subjectId: subject.id,
        batchId: batch.id,
        teacherId: teacher.id,
        coTeacherId: item.coTeacherId || null,
        active: 1,
      });
    }
    const students = d.users.filter(
      (student) => student.role === 'STUDENT' && student.active && student.batchId === batch.id,
    );
    const writes: ReturnType<typeof stmt>[] = [];
    for (const offering of assignments) {
      writes.push(insert('offerings', offering));
      for (const student of students)
        writes.push(
          insert('enrollments', {
            id: uid(),
            studentId: student.id,
            offeringId: offering.id,
            active: 1,
          }),
        );
      writes.push(
        auditStmt(
          u,
          'assign',
          'offerings',
          offering.id,
          JSON.stringify({
            batchId: batch.id,
            subjectId: offering.subjectId,
            teacherId: offering.teacherId,
          }),
        ),
      );
    }
    await db().batch(writes);
    return { created: assignments.length, enrolled: assignments.length * students.length };
  }
  if (body.action === 'attendanceView') {
    assert(permitted(u, 'view_attendance', c.rolePrivileges));
    assert(
      ['STUDENT', 'TEACHER', 'HOD'].includes(u.role),
      'Attendance viewing is not available for this account.',
    );
    const values =
      u.role === 'STUDENT' ? [u.id, u.id] : u.role === 'TEACHER' ? [u.id, u.id] : [u.departmentId];
    const where =
      u.role === 'STUDENT'
        ? 'EXISTS (SELECT 1 FROM enrollments e WHERE e.offeringId=o.id AND e.studentId=? AND e.active=1) OR EXISTS (SELECT 1 FROM attendance a WHERE a.offeringId=o.id AND a.studentId=?)'
        : u.role === 'TEACHER'
          ? '(o.teacherId=? OR o.coTeacherId=?) AND (o.active=1 OR EXISTS (SELECT 1 FROM attendance a WHERE a.offeringId=o.id))'
          : 'b.departmentId=?';
    const offerings = (
      await stmt(
        `SELECT o.id,o.subjectId,o.batchId,o.teacherId,o.coTeacherId,o.active,s.credits,(SELECT count(*) FROM enrollments e WHERE e.offeringId=o.id AND e.active=1) AS enrollmentCount,s.name AS subjectName,s.code AS subjectCode,b.name AS batchName,b.semester,p.name AS programName,se.name AS sessionName FROM offerings o JOIN subjects s ON s.id=o.subjectId JOIN batches b ON b.id=o.batchId JOIN programs p ON p.id=b.programId JOIN sessions se ON se.id=b.sessionId WHERE ${where} ORDER BY s.code,s.name,b.name,b.semester`,
        values,
      ).all<Row>()
    ).results;
    if (!body.offeringId) return { offerings };
    const offering = offerings.find((item) => item.id === body.offeringId);
    assert(offering, 'You are not authorized to view attendance for this subject/class.', 403);
    let students: Row[];
    if (u.role === 'STUDENT') {
      students = (
        await stmt(
          'SELECT id,name,identifier,role,active,avatar FROM users WHERE id=? AND role=?',
          [u.id, 'STUDENT'],
        ).all<Row>()
      ).results;
    } else {
      students = (
        await stmt(
          "SELECT u.id,u.name,u.identifier,u.role,u.active,u.avatar FROM users u WHERE u.role='STUDENT' AND (EXISTS (SELECT 1 FROM enrollments e WHERE e.offeringId=? AND e.studentId=u.id AND e.active=1) OR EXISTS (SELECT 1 FROM attendance a WHERE a.offeringId=? AND a.studentId=u.id)) ORDER BY u.name",
          [offering.id, offering.id],
        ).all<Row>()
      ).results;
    }
    const selectedStudent = body.studentId
      ? students.find((student) => student.id === body.studentId)
      : null;
    if (body.studentId)
      assert(
        selectedStudent,
        'You are not authorized to view this student’s attendance for the selected subject/class.',
        403,
      );
    const recordStudentId = u.role === 'STUDENT' ? u.id : selectedStudent?.id;
    let attendanceSql =
        'SELECT id,offeringId,studentId,date,status,remarks,recordedBy FROM attendance WHERE offeringId=?',
      attendanceValues: any[] = [offering.id];
    if (recordStudentId) {
      attendanceSql += ' AND studentId=?';
      attendanceValues.push(recordStudentId);
    }
    if (body.date !== undefined) {
      assert(
        typeof body.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(body.date) &&
          Number.isFinite(Date.parse(body.date)),
        'Attendance date is invalid.',
        400,
      );
      attendanceSql += ' AND date=?';
      attendanceValues.push(body.date);
    }
    attendanceSql += ' ORDER BY date,studentId';
    const [attendance, timetable] = await Promise.all([
      stmt(attendanceSql, attendanceValues).all<Row>(),
      stmt(
        'SELECT id,offeringId,day,startTime,endTime,room FROM timetable WHERE offeringId=? ORDER BY day,startTime',
        [offering.id],
      ).all<Row>(),
    ]);
    return {
      offerings,
      offering,
      students: students.sort(rollOrder),
      attendance: attendance.results,
      timetable: permitted(u, 'view_timetable', c.rolePrivileges) ? timetable.results : [],
    };
  }
  if (body.action === 'attendanceSubmit') {
    assert(permitted(u, 'attendance', c.rolePrivileges));
    const offering = relation(d, 'offerings', body.offeringId);
    assert(teachingAllowed(u, offering));
    assert(
      typeof body.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(body.date) &&
        Number.isFinite(Date.parse(body.date)) &&
        body.date <= new Date().toISOString().slice(0, 10),
      'Attendance date is invalid or in the future.',
      400,
    );
    assert(
      Array.isArray(body.records) && body.records.length > 0 && body.records.length <= 500,
      'Attendance roster is empty or too large.',
      400,
    );
    const roster = d.enrollments
      .filter((e) => e.offeringId === offering.id && e.active)
      .map((e) => e.studentId)
      .sort();
    const submitted = body.records.map((record: Row) => record?.studentId).sort();
    assert(
      new Set(submitted).size === submitted.length &&
        submitted.length === roster.length &&
        submitted.every((id: string, i: number) => id === roster[i]),
      'Attendance must include each currently enrolled student exactly once.',
      400,
    );
    assert(
      body.records.every(
        (record: Row) =>
          ['Present', 'Absent', 'Late'].includes(record?.status) ||
          (record?.status === 'Excused' &&
            d.attendance.some(
              (a) =>
                a.offeringId === offering.id &&
                a.studentId === record.studentId &&
                a.date === body.date &&
                a.status === 'Excused',
            )),
      ),
      'Select a valid attendance status.',
      400,
    );
    assert(
      body.records.every(
        (r: Row) => !r.remarks || (typeof r.remarks === 'string' && r.remarks.length <= 1000),
      ),
      'Remarks must be at most 1000 characters.',
      400,
    );
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    assert(reason.length <= 1000, 'Correction reason is too long.', 400);
    const existing = d.attendance.filter(
      (record) => record.offeringId === offering.id && record.date === body.date,
    );
    const corrections = body.records.filter((record: Row) =>
      existing.some(
        (previous) => previous.studentId === record.studentId && previous.status !== record.status,
      ),
    );
    assert(
      !corrections.length || reason.length >= 5,
      'Explain attendance corrections (at least 5 characters).',
      400,
    );
    const now = new Date().toISOString();
    const writes = body.records.map((record: Row) => {
      const previous = existing.find((item) => item.studentId === record.studentId);
      return stmt(
        'INSERT INTO attendance(id,offeringId,studentId,date,status,reason,recordedBy,remarks) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(offeringId,studentId,date) DO UPDATE SET status=excluded.status,reason=excluded.reason,recordedBy=excluded.recordedBy,remarks=excluded.remarks',
        [
          previous?.id || uid(),
          offering.id,
          record.studentId,
          body.date,
          record.status,
          corrections.some((item) => item.studentId === record.studentId)
            ? reason
            : previous?.reason || null,
          u.id,
          record.status === 'Late' ? record.remarks?.trim() || null : null,
        ],
      );
    });
    writes.push(
      auditStmt(
        u,
        'submit',
        'attendance',
        offering.id,
        JSON.stringify({
          date: body.date,
          students: body.records.length,
          corrections: corrections.length,
          submittedAt: now,
        }),
      ),
    );
    await db().batch(writes);
    return {
      date: body.date,
      offeringId: offering.id,
      students: body.records.length,
      corrections: corrections.length,
    };
  }
  if (body.action === 'profile') {
    const r = body.record || {};
    assert(
      typeof r.name === 'string' && r.name.trim().length > 1 && r.name.length < 100,
      'Enter your name.',
      400,
    );
    assert(!r.phone || String(r.phone).length < 40, 'Phone number is too long.', 400);
    assert(
      r.qualifications === undefined ||
        (['TEACHER', 'HOD'].includes(u.role) &&
          typeof r.qualifications === 'string' &&
          r.qualifications.length <= 4000),
      'Invalid qualifications.',
      400,
    );
    await db().batch([
      stmt('UPDATE users SET name=?,phone=?,qualifications=COALESCE(?,qualifications) WHERE id=?', [
        r.name.trim(),
        r.phone || null,
        r.qualifications ?? null,
        u.id,
      ]),
      auditStmt(u, 'update', 'profile', u.id),
    ]);
    return;
  }
  if (body.action === 'submit') {
    assert(u.role === 'STUDENT' && permitted(u, 'submit_assignments', c.rolePrivileges));
    const a = relation(d, 'assignments', body.assignmentId);
    assert(a.published && offeringAllowed(u, relation(d, 'offerings', a.offeringId), d));
    assert(Date.now() <= Date.parse(a.dueDate), 'The submission deadline has passed.', 400);
    const old = d.submissions.find((s) => s.studentId === u.id && s.assignmentId === a.id);
    assert(!old || old.marks === null, 'A graded submission cannot be replaced.', 400);
    assert(
      typeof body.content === 'string' &&
        body.content.trim().length > 0 &&
        body.content.length <= 20000,
      'Add submission text or a repository link.',
      400,
    );
    if (body.fileId) {
      const f = await stmt('SELECT * FROM files WHERE id=?', [body.fileId]).first<Row>();
      assert(f?.ownerId === u.id, 'Invalid attachment.', 400);
    }
    const written = await stmt(
      'INSERT INTO submissions(id,assignmentId,studentId,content,fileId,submittedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(assignmentId,studentId) DO UPDATE SET content=excluded.content,fileId=excluded.fileId,submittedAt=excluded.submittedAt WHERE submissions.marks IS NULL RETURNING id',
      [old?.id || uid(), a.id, u.id, body.content, body.fileId || null, new Date().toISOString()],
    ).first();
    assert(written, 'This submission was graded before your update. Refresh the page.', 409);
    return;
  }
  if (body.action === 'grade') {
    assert(permitted(u, 'assignments', c.rolePrivileges));
    const s = relation(d, 'submissions', body.id),
      a = relation(d, 'assignments', s.assignmentId);
    assert(teachingAllowed(u, relation(d, 'offerings', a.offeringId)));
    const marks = number(body.marks, 0, a.maxMarks, 'Marks');
    assert(!body.feedback || String(body.feedback).length < 5000, 'Feedback is too long.', 400);
    await db().batch([
      stmt('UPDATE submissions SET marks=?,feedback=?,gradedBy=? WHERE id=?', [
        marks,
        body.feedback || '',
        u.id,
        s.id,
      ]),
      auditStmt(u, 'grade', 'submissions', s.id),
    ]);
    return;
  }
  if (body.action === 'quizStart' || body.action === 'quizSave' || body.action === 'quizSubmit')
    throw new AppError(
      'Online quizzes are disabled. Teachers publish quiz topics and study resources here.',
      403,
    );
  if (body.action === 'progress') {
    assert(u.role === 'STUDENT' && permitted(u, 'learning_progress', c.rolePrivileges));
    const m = relation(d, 'materials', body.id);
    assert(offeringAllowed(u, relation(d, 'offerings', m.offeringId), d));
    await stmt(
      'INSERT INTO progress(id,materialId,studentId,completed) VALUES(?,?,?,?) ON CONFLICT(materialId,studentId) DO UPDATE SET completed=excluded.completed',
      [uid(), m.id, u.id, body.completed ? 1 : 0],
    ).run();
    return;
  }
  if (body.action === 'resultBatch') {
    assert(permitted(u, 'results', c.rolePrivileges));
    const offering = relation(d, 'offerings', body.offeringId),
      batch = d.batches.find((x) => x.id === offering.batchId);
    assert(
      resultsAllowed(u, offering, d),
      'You may only publish results within your authorized department or subjects.',
    );
    assert(
      typeof body.title === 'string' &&
        body.title.trim().length > 0 &&
        body.title.trim().length <= 120,
      'Enter an assessment name.',
      400,
    );
    const maxMarks = number(body.maxMarks, 1, 1000, 'Maximum marks'),
      records = body.records;
    assert(
      Array.isArray(records) && records.length > 0 && records.length <= 500,
      'No enrolled students were selected.',
      400,
    );
    const roster = d.enrollments
      .filter((e) => e.offeringId === offering.id && e.active)
      .map((e) => e.studentId)
      .sort();
    const submitted = records.map((r: Row) => r?.studentId).sort();
    assert(
      submitted.length === roster.length &&
        new Set(submitted).size === submitted.length &&
        submitted.every((id: string, i: number) => id === roster[i]),
      'Include every currently enrolled student exactly once.',
      400,
    );
    const title = body.title.trim(),
      published = body.published ? 1 : 0,
      reason = typeof body.correctionReason === 'string' ? body.correctionReason.trim() : '';
    assert(reason.length <= 1000, 'Correction reason is too long.', 400);
    const writes: ReturnType<typeof stmt>[] = [];
    for (const record of records) {
      const marks = number(record.marks, 0, maxMarks, 'Marks');
      const old = d.results.find(
        (x) =>
          x.offeringId === offering.id && x.studentId === record.studentId && x.title === title,
      );
      if (
        old?.published &&
        (old.marks !== marks || old.maxMarks !== maxMarks || old.published !== published)
      )
        assert(
          reason.length >= 5,
          'Explain published result corrections (at least 5 characters).',
          400,
        );
      writes.push(
        stmt(
          'INSERT INTO results(id,offeringId,studentId,title,marks,maxMarks,published,feedback,updatedBy) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(offeringId,studentId,title) DO UPDATE SET marks=excluded.marks,maxMarks=excluded.maxMarks,published=excluded.published,feedback=excluded.feedback,updatedBy=excluded.updatedBy',
          [
            old?.id || uid(),
            offering.id,
            record.studentId,
            title,
            marks,
            maxMarks,
            published,
            record.feedback || '',
            u.id,
          ],
        ),
      );
      writes.push(
        auditStmt(
          u,
          old ? 'update' : 'publish',
          'results',
          old?.id || record.studentId,
          JSON.stringify({ offeringId: offering.id, title, marks, maxMarks, published, reason }),
        ),
      );
    }
    await db().batch(writes);
    return { offeringId: offering.id, students: records.length };
  }
  if (body.action === 'assignHod') {
    assert(permitted(u, 'academic', c.rolePrivileges));
    assert(broad(u) || permitted(u, 'senior_accounts', c.rolePrivileges));
    const department = relation(d, 'departments', body.departmentId);
    assert(body.hodId === null || typeof body.hodId === 'string', 'Select a valid HOD.', 400);
    const hod = body.hodId ? relation(d, 'users', body.hodId) : null;
    if (hod) assert(hod.role === 'HOD' && hod.active, 'Select an active HOD account.', 400);
    const writes: ReturnType<typeof stmt>[] = [];
    const current = d.users.filter((x) => x.role === 'HOD' && x.departmentId === department.id);
    for (const assigned of current)
      if (assigned.id !== hod?.id)
        writes.push(stmt('UPDATE users SET departmentId=NULL WHERE id=?', [assigned.id]));
    if (hod)
      writes.push(stmt('UPDATE users SET departmentId=? WHERE id=?', [department.id, hod.id]));
    writes.push(auditStmt(u, 'assign', 'department-hod', department.id, hod?.id || 'Unassigned'));
    await db().batch(writes);
    return;
  }
  if (body.action === 'grading') {
    assert(permitted(u, 'system_settings', c.rolePrivileges));
    let policy;
    try {
      policy = validateGrading(body.policy);
    } catch (e) {
      throw new AppError((e as Error).message);
    }
    await db().batch([
      stmt(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ['grading', JSON.stringify(policy)],
      ),
      auditStmt(u, 'update', 'grading-policy', 'grading', JSON.stringify(policy)),
    ]);
    return;
  }
  if (body.action === 'settings') {
    assert(permitted(u, 'system_settings', c.rolePrivileges));
    assert(
      typeof body.college === 'string' && body.college.trim() && body.college.length <= 200,
      'Enter the college name.',
      400,
    );
    await db().batch([
      stmt('UPDATE settings SET value=? WHERE key=?', [body.college.trim(), 'college']),
      auditStmt(u, 'update', 'settings', 'college'),
    ]);
    return;
  }
  if (body.action === 'saveUserPrivileges') {
    assert(
      permitted(u, 'manage_access', c.rolePrivileges),
      'Only authorized access managers can configure individual access.',
    );
    const target = await stmt('SELECT * FROM users WHERE id=?', [body.userId]).first<Row>();
    assert(target, 'User not found.', 404);
    assert(target.role !== 'ADMIN', 'Administrator access is protected.', 400);
    const overrides = body.permissions;
    assert(
      overrides && typeof overrides === 'object' && !Array.isArray(overrides),
      'Provide a permissions object.',
      400,
    );
    for (const [key, value] of Object.entries(overrides))
      assert(
        isValidPrivilege(key, c.rolePrivileges) && typeof value === 'boolean',
        'Invalid permission or value.',
        400,
      );
    const before = userPrivileges(target),
      after = JSON.stringify(overrides);
    const expected = body.expectedPermissions;
    assert(
      typeof expected === 'string' && expected === (target.permissions || '{}'),
      'Permissions changed elsewhere. Reload before saving.',
      409,
    );
    const writes = await db().batch([
      stmt(
        "UPDATE users SET permissions=? WHERE id=? AND COALESCE(permissions,'{}')=? RETURNING id",
        [after, target.id, expected],
      ),
      auditStmt(
        u,
        'update',
        'user-privileges',
        target.id,
        JSON.stringify({ before, after: overrides }),
      ),
    ]);
    assert(writes[0].results.length, 'Permissions changed elsewhere. Reload before saving.', 409);
    return { userId: target.id, permissions: after };
  }
  if (body.action === 'saveRolePrivileges') {
    assert(
      permitted(u, 'manage_access', c.rolePrivileges),
      'Only authorized access managers can configure role privileges.',
    );
    const { privileges, rolePermissions } = body;
    if (body.expectedConfig !== undefined)
      assert(
        body.expectedConfig === JSON.stringify(await getRolePrivileges()),
        'Role defaults changed elsewhere. Reload before saving.',
        409,
      );
    assert(
      Array.isArray(privileges) && privileges.length > 0,
      'Privileges list cannot be empty.',
      400,
    );
    assert(
      rolePermissions && typeof rolePermissions === 'object',
      'Role permissions mapping is required.',
      400,
    );
    for (const p of privileges) {
      assert(
        p && typeof p.key === 'string' && /^[a-z0-9_-]{2,50}$/i.test(p.key),
        `Invalid privilege key: ${p?.key}`,
        400,
      );
      assert(
        typeof p.label === 'string' && p.label.trim().length > 0 && p.label.length <= 100,
        'Privilege label must be between 1 and 100 characters.',
        400,
      );
    }
    const keys = new Set(privileges.map((p: any) => p.key));
    assert(keys.size === privileges.length, 'Duplicate privilege keys.', 400);
    for (const def of getDefaultRolePrivileges().privileges)
      assert(keys.has(def.key), 'Built-in privileges cannot be removed.', 400);
    for (const [role, permissions] of Object.entries(rolePermissions))
      assert(
        roles.includes(role as any) &&
          Array.isArray(permissions) &&
          permissions.every((k) => typeof k === 'string' && keys.has(k)),
        'Invalid role or privilege mapping.',
        400,
      );
    rolePermissions.ADMIN = privileges.map((p: any) => p.key);
    const config: RolePrivilegesConfig = { privileges, rolePermissions };
    await db().batch([
      stmt(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ['role_privileges', JSON.stringify(config)],
      ),
      auditStmt(
        u,
        'update',
        'role-privileges',
        'role_privileges',
        JSON.stringify({ before: c.rolePrivileges, after: config }),
      ),
    ]);
    return { rolePrivileges: config };
  }
  if (body.action === 'addPrivilege') {
    assert(
      permitted(u, 'manage_access', c.rolePrivileges),
      'Only authorized access managers can add privileges.',
    );
    const { key, label, description, initialRoles } = body;
    assert(
      typeof key === 'string' && /^[a-z0-9_-]{2,50}$/i.test(key.trim()),
      'Privilege key must be 2–50 characters (letters, numbers, underscore or dash).',
      400,
    );
    const cleanKey = key.trim().toLowerCase();
    assert(
      typeof label === 'string' && label.trim().length > 0 && label.trim().length <= 100,
      'Enter a valid privilege label (1–100 characters).',
      400,
    );
    const current = await getRolePrivileges();
    assert(
      !current.privileges.some((p) => p.key === cleanKey),
      'A privilege with this key already exists.',
      400,
    );
    const newPriv = {
      key: cleanKey,
      label: label.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      builtIn: false,
    };
    const updatedPrivileges = [...current.privileges, newPriv];
    const updatedRolePermissions = { ...current.rolePermissions };
    const rolesToAssign = Array.isArray(initialRoles) ? initialRoles : ['ADMIN'];
    if (!rolesToAssign.includes('ADMIN')) rolesToAssign.push('ADMIN');
    for (const role of roles) {
      const perms = new Set(updatedRolePermissions[role] || []);
      if (rolesToAssign.includes(role)) perms.add(cleanKey);
      updatedRolePermissions[role] = Array.from(perms);
    }
    const config: RolePrivilegesConfig = {
      privileges: updatedPrivileges,
      rolePermissions: updatedRolePermissions,
    };
    await db().batch([
      stmt(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ['role_privileges', JSON.stringify(config)],
      ),
      auditStmt(
        u,
        'create',
        'role-privilege',
        cleanKey,
        JSON.stringify({ label, assignedRoles: rolesToAssign }),
      ),
    ]);
    return { rolePrivileges: config };
  }
  if (body.action === 'deletePrivilege') {
    assert(
      permitted(u, 'manage_access', c.rolePrivileges),
      'Only authorized access managers can delete privileges.',
    );
    assert(typeof body.key === 'string' && body.key, 'Select a valid privilege.', 400);
    const current = await getRolePrivileges();
    const target = current.privileges.find((p) => p.key === body.key);
    assert(target, 'Privilege not found.', 404);
    assert(!target.builtIn, 'Built-in system privileges cannot be deleted.', 400);
    const updatedPrivileges = current.privileges.filter((p) => p.key !== body.key);
    const updatedRolePermissions: Record<string, string[]> = {};
    for (const [r, perms] of Object.entries(current.rolePermissions)) {
      updatedRolePermissions[r] = perms.filter((k) => k !== body.key);
    }
    const config: RolePrivilegesConfig = {
      privileges: updatedPrivileges,
      rolePermissions: updatedRolePermissions,
    };
    await db().batch([
      stmt(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ['role_privileges', JSON.stringify(config)],
      ),
      auditStmt(u, 'delete', 'role-privilege', body.key),
    ]);
    return { rolePrivileges: config };
  }
  if (body.action === 'resetRolePrivileges') {
    assert(
      permitted(u, 'manage_access', c.rolePrivileges),
      'Only authorized access managers can reset privileges.',
    );
    const config = getDefaultRolePrivileges();
    await db().batch([
      stmt(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ['role_privileges', JSON.stringify(config)],
      ),
      auditStmt(u, 'reset', 'role-privileges', 'role_privileges'),
    ]);
    return { rolePrivileges: config };
  }
  throw new AppError('Unknown action.');
}
