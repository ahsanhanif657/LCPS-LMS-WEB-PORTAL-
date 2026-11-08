import { createBackup, listBackups, restoreBackup } from '../lib/lms/backups';
import { validateGrading, courseGrade, transcript } from '../lib/lms/grading';
import { POST as authenticate } from '../app/api/auth/route';
import { env } from './runtime';
import { jar } from './headers';
import { hashPassword, digest, token } from '../lib/lms/password';
import { seedData } from '../lib/lms/seed';
import { tables } from '../lib/lms/types';
import { POST as setup } from '../app/api/setup/route';
import { ensureDatabase } from '../lib/database';
await ensureDatabase();
const setupRequest = (body: any) =>
  setup(
    new Request('https://portal.test/api/setup', {
      method: 'POST',
      headers: { origin: 'https://portal.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as any,
  );
async function auth(body: any) {
  return authenticate(
    new Request('https://portal.test/api/auth', {
      method: 'POST',
      headers: { origin: 'https://portal.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as any,
  );
}
async function impersonate(id: string) {
  const value = token();
  await insert('loginSessions', {
    tokenHash: await digest(value),
    userId: id,
    expires: Date.now() + 3600000,
  }).run();
  jar.set('lcps_session', value);
}
import assert from 'node:assert/strict';
import { context, action, all, stmt, save, remove, payload, insert, db } from '../lib/lms/service';
import { scopedData, attendancePercent, overlap } from '../lib/lms/policy';
import { pageAllowed } from '../security/privileges';
import {
  inspectResourceUpload,
  resourceExtensionAllowed,
  resourceMimeAllowed,
  maxBookUploadBytes,
  maxUploadBytes,
} from '../lib/lms/file-types';

import { POST as uploadFile } from '../app/api/files/route';
import { GET as getFile } from '../app/api/files/[id]/route';
import { POST as postApi } from '../app/api/lms/route';
import {
  guessAccountImportMappings,
  parseAccountImportFile,
} from '../lib/lms/account-import-files';
let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log('PASS', name);
}
async function ctx(id = 'lcps-administrator') {
  const c = await context();
  return {
    ...c,
    data: {
      ...c.data,
      personalEntries: (await stmt('SELECT * FROM personalEntries WHERE userId=?', [id]).all<Row>())
        .results,
    },
    user: { ...c.data.users.find((u) => u.id === id)!, accessConfig: c.rolePrivileges },
  };
}
async function rejects(fn: () => Promise<unknown>, regex?: RegExp) {
  if (regex) await assert.rejects(fn, regex);
  else await assert.rejects(fn);
}
await test('first administrator setup is protected, one-time and independent of ChatGPT', async () => {
  assert.equal(
    (
      await setupRequest({
        setupKey: 'incorrect',
        name: 'Ahsan Hanif',
        username: 'ahsanhanif',
        password: 'test-admin-password',
      })
    ).status,
    403,
  );
  const good = await setupRequest({
    setupKey: process.env.ADMIN_SETUP_KEY,
    name: 'Ahsan Hanif',
    username: 'ahsanhanif',
    password: 'test-admin-password',
  });
  assert.equal(good.status, 200, await good.text());
  assert.equal(
    (
      await setupRequest({
        setupKey: process.env.ADMIN_SETUP_KEY,
        name: 'New admin',
        username: 'other',
        password: 'test-other-password',
      })
    ).status,
    409,
  );
});
await test('fresh database has only administrator and requires college login', async () => {
  await rejects(() => context(), /username and password/);
  assert.equal((await all('users')).length, 1);
  assert.equal((await all('subjects')).length, 0);
  assert.equal(
    (await auth({ action: 'login', username: 'ahsanhanif', password: 'wrong-password' })).status,
    401,
  );
  assert.equal(
    (await auth({ action: 'login', username: 'ahsanhanif', password: 'test-admin-password' }))
      .status,
    200,
  );
  await rejects(() => context(), /Change your password/);
  assert.equal((await context(false, true)).user.name, 'Ahsan Hanif');
});
await test('password change revokes sessions and old password', async () => {
  assert.equal(
    (
      await auth({
        action: 'change',
        currentPassword: 'test-admin-password',
        newPassword: 'new-test-password',
      })
    ).status,
    200,
  );
  await rejects(() => context());
  assert.equal(
    (await auth({ action: 'login', username: 'ahsanhanif', password: 'test-admin-password' }))
      .status,
    401,
  );
  assert.equal(
    (await auth({ action: 'login', username: 'ahsanhanif', password: 'new-test-password' })).status,
    200,
  );
});
await test('bootstrap is idempotent and does not reset password', async () => {
  await context();
  assert.equal((await all('users')).length, 1);
  assert.equal(
    (await auth({ action: 'login', username: 'ahsanhanif', password: 'new-test-password' })).status,
    200,
  );
});
// Academic fixtures exist only in the test database, never in deployed initialization.
const fixture = seedData();
for (const t of tables)
  for (const row of fixture[t] || [])
    await insert(t, {
      ...row,
      ...(t === 'users' ? { demo: 0, passwordPolicyVersion: 1 } : {}),
    }).run();
await test('unauthenticated visitors denied', async () => {
  const value = jar.get('lcps_session')!.value;
  jar.set('lcps_session', '', { maxAge: 0 });
  await rejects(() => context(), /sign in/);
  jar.set('lcps_session', value);
});
await test('student sees only own coursework plus safe current-class profiles', async () => {
  const c = await ctx('student');
  const d = payload(c).data;
  assert(d.attendance.every((x) => x.studentId === 'student'));
  assert(d.results.every((x) => x.studentId === 'student'));
  assert(d.users.some((x) => x.id === 'student2'));
  assert(!d.users.some((x) => x.id === 'student3'));
  assert(!('username' in d.users.find((x) => x.id === 'student2')!));
  assert(d.quizzes.every((q) => q.questions.every((x: any) => !('correct' in x))));
});
await test('student cannot create user or change marks', async () => {
  const c = await ctx('student');
  await rejects(() => save(c, 'users', { name: 'Evil', username: 'evil', role: 'ADMIN' }));
  await rejects(() => save(c, 'results', { ...c.data.results[0], marks: 25 }));
});
await test('teacher only accesses assigned offerings and cannot mutate other subjects', async () => {
  const c = await ctx('teacher');
  assert(payload(c).data.offerings.every((o) => o.teacherId === 'teacher'));
  await rejects(() =>
    save(c, 'assignments', {
      offeringId: 'off-automata',
      title: 'No',
      instructions: 'No',
      dueDate: new Date().toISOString(),
      maxMarks: 20,
    }),
  );
});
await test('staff cannot record attendance', async () => {
  const c = await ctx('staff');
  assert.equal(payload(c).data.offerings.length, 0);
  await rejects(() =>
    save(c, 'attendance', {
      offeringId: 'off-mobile',
      studentId: 'student',
      date: '2026-01-01',
      status: 'Present',
    }),
  );
});
await test('HOD cannot access another department or edit out of scope students', async () => {
  const c = await ctx('hod_pharmd');
  assert(payload(c).data.users.every((u) => u.departmentId === 'pharm' || u.id === c.user.id));
  assert(pageAllowed(c.user, 'myDepartment'));
  assert(!pageAllowed(c.user, 'myCollege'));
  assert(!pageAllowed(c.user, 'myClass'));
  await rejects(() =>
    save(c, 'users', { ...c.data.users.find((u) => u.id === 'student'), name: 'No' }),
  );
  await rejects(() =>
    save(c, 'subjects', { name: 'No', code: 'INVALID', departmentId: 'cs', credits: 3 }),
  );
});
await test('principal academic profiles exclude account and authentication fields', async () => {
  const c = await ctx('principal');
  const data = payload(c).data;
  assert(pageAllowed(c.user, 'myCollege'));
  assert(!pageAllowed(c.user, 'myDepartment'));
  assert(!pageAllowed(c.user, 'myClass'));
  assert(data.users.some((u) => u.role === 'STUDENT'));
  assert(data.users.some((u) => u.role === 'TEACHER'));
  assert(!data.users.some((u) => u.role === 'ADMIN'));
  assert(!data.users.some((u) => u.role === 'PRINCIPAL' && u.id !== c.user.id));
  for (const person of data.users)
    for (const field of [
      'username',
      'email',
      'phone',
      'permissions',
      'passwordChangeRequired',
      'passwordPolicyVersion',
      'responsibilities',
      'createdAt',
      'demo',
    ])
      assert(!Object.prototype.hasOwnProperty.call(person, field));
});
await test('students receive only their current class profiles and semester teachers', async () => {
  const c = await ctx('student');
  const data = payload(c).data;
  assert(pageAllowed(c.user, 'myClass'));
  assert(!pageAllowed(c.user, 'myDepartment'));
  assert(!pageAllowed(c.user, 'myCollege'));
  assert(data.users.some((u) => u.id === 'student2'));
  assert(!data.users.some((u) => ['student3', 'student4', 'admin', 'principal'].includes(u.id)));
  assert(
    data.users
      .filter((u) => u.id !== c.user.id)
      .every((u) => !('username' in u) && !('permissions' in u) && !('email' in u)),
  );
  const classOfferings = data.academicDirectoryOfferings;
  assert(classOfferings.length > 0);
  assert(
    classOfferings.every((o) => {
      const batch = data.batches.find((b) => b.id === o.batchId);
      return (
        batch?.departmentId === 'cs' &&
        batch.programId === 'bscs' &&
        batch.sessionId === 's24' &&
        batch.semester === 4
      );
    }),
  );
});
await test('subject program and session assignments are multi-program, scoped and non-duplicating', async () => {
  let c = await ctx();
  const secondProgramId = await save(c, 'programs', {
    name: 'BS Software Engineering Test',
    departmentId: 'cs',
  });
  c = await ctx();
  await save(c, 'batches', {
    name: 'BSSE-24-TEST',
    departmentId: 'cs',
    programId: secondProgramId,
    sessionId: 's24',
    semester: 4,
  });
  c = await ctx();
  const sessionAssignments = [
    JSON.stringify(['bscs', 's24']),
    JSON.stringify([secondProgramId, 's24']),
  ];
  const subjectId = await save(c, 'subjects', {
    name: 'Programming Fundamentals Test',
    code: 'PF-TEST-1',
    departmentId: 'cs',
    credits: 3,
    programIds: ['bscs', secondProgramId],
    sessionAssignments,
  });
  assert.equal((await all('subjects')).filter((s) => s.id === subjectId).length, 1);
  assert.equal((await all('subjectPrograms')).filter((r) => r.subjectId === subjectId).length, 2);
  assert.deepEqual(
    (await all('subjectSessions'))
      .filter((r) => r.subjectId === subjectId)
      .map((r) => [r.programId, r.sessionId])
      .sort(),
    [
      ['bscs', 's24'],
      [secondProgramId, 's24'],
    ].sort(),
  );
  c = await ctx();
  const subject = c.data.subjects.find((s) => s.id === subjectId)!;
  await save(c, 'subjects', {
    ...subject,
    programIds: ['bscs', secondProgramId],
    sessionAssignments,
  });
  assert.equal((await all('subjects')).filter((s) => s.id === subjectId).length, 1);
  await rejects(async () =>
    save(await ctx(), 'subjects', {
      name: 'Invalid cross department subject',
      code: 'PF-TEST-2',
      departmentId: 'cs',
      credits: 3,
      programIds: ['pharmd'],
      sessionAssignments: [],
    }),
  );
  await rejects(async () =>
    save(await ctx(), 'subjects', {
      name: 'Invalid session subject',
      code: 'PF-TEST-3',
      departmentId: 'cs',
      credits: 3,
      programIds: ['bscs'],
      sessionAssignments: [JSON.stringify(['bscs', 'missing-session'])],
    }),
  );
});
await test('student account stores department, program, session and batch consistently', async () => {
  const c = await ctx();
  const id = await save(c, 'users', {
    name: 'Program import test',
    username: 'program-import-test',
    password: 'program-test-password',
    role: 'STUDENT',
    departmentId: 'cs',
    programId: 'bscs',
    sessionId: 's24',
    batchId: 'cs4',
    identifier: 'PROGRAM-TEST-1',
  });
  const stored = (await all('users')).find((user) => user.id === id);
  assert.equal(stored?.programId, 'bscs');
  assert.equal(stored?.sessionId, 's24');
  assert.equal(payload(await ctx()).data.users.find((user) => user.id === id)?.programId, 'bscs');
  await rejects(
    () =>
      save(c, 'users', {
        name: 'Invalid program test',
        username: 'invalid-program-test',
        password: 'program-test-password',
        role: 'STUDENT',
        departmentId: 'cs',
        programId: 'pharmd',
        sessionId: 's24',
        batchId: 'cs4',
        identifier: 'PROGRAM-TEST-2',
      }),
    /program, department and batch do not match/,
  );
});
await test('different subjects may share a subject code and admins can remove subjects', async () => {
  const c = await ctx(),
    one = await save(c, 'subjects', {
      name: 'Distinct elective one',
      code: 'SHARED-101',
      departmentId: 'cs',
      credits: 3,
    }),
    two = await save(c, 'subjects', {
      name: 'Distinct elective two',
      code: 'SHARED-101',
      departmentId: 'cs',
      credits: 3,
    });
  await remove(await ctx(), 'subjects', one);
  assert(!(await all('subjects')).some((s) => s.id === one));
  assert((await all('subjects')).some((s) => s.id === two));
});
await test('HOD manages only department student and teacher accounts while senior roles stay admin-only', async () => {
  const hod = await ctx('hod_pharmd');
  const studentId = await save(hod, 'users', {
    name: 'Pharmacy account',
    username: 'pharmacy-account',
    password: 'student-test-password',
    role: 'STUDENT',
    departmentId: 'pharm',
    batchId: 'ph4',
  });
  const teacherId = await save(hod, 'users', {
    name: 'Pharmacy instructor',
    username: 'pharmacy-instructor',
    password: 'teacher-test-password',
    role: 'TEACHER',
    employmentType: 'Visiting',
    departmentId: 'pharm',
  });
  assert.equal((await all('users')).find((u) => u.id === studentId)?.role, 'STUDENT');
  assert.equal((await all('users')).find((u) => u.id === teacherId)?.role, 'TEACHER');
  await rejects(() =>
    save(hod, 'users', {
      name: 'Cross department',
      username: 'cross-department',
      password: 'student-test-password',
      role: 'STUDENT',
      departmentId: 'cs',
      batchId: 'cs4',
    }),
  );
  await rejects(() =>
    save(hod, 'users', {
      name: 'New HOD',
      username: 'new-hod',
      password: 'student-test-password',
      role: 'HOD',
      departmentId: 'pharm',
    }),
  );
  await rejects(async () =>
    save(await ctx('principal'), 'users', {
      name: 'Principal user',
      username: 'principal-user',
      password: 'student-test-password',
      role: 'STUDENT',
      departmentId: 'cs',
      batchId: 'cs4',
    }),
  );
  await rejects(() => save(hod, 'users', { id: teacherId, role: 'ADMIN' }));
  await remove(await ctx('hod_pharmd'), 'users', studentId);
  await remove(await ctx('hod_pharmd'), 'users', teacherId);
  assert(!(await all('users')).some((u) => u.id === studentId || u.id === teacherId));
});
await test('principal can create academic records but not admin users', async () => {
  const c = await ctx('principal');
  await save(c, 'departments', { name: 'Test department', code: 'TEST' });
  await rejects(() => save(c, 'users', { name: 'No', username: 'no-admin', role: 'ADMIN' }));
});
await test('principal can assign a HOD to an academic department', async () => {
  await action(await ctx('principal'), {
    action: 'assignHod',
    departmentId: 'cs',
    hodId: 'hod_cs',
  });
  assert.equal((await all('users')).find((u) => u.id === 'hod_cs')?.departmentId, 'cs');
});
await test('admin creates credentials, reset revokes sessions, and can delete users', async () => {
  const id = await save(await ctx(), 'users', {
    name: 'Real staff',
    username: 'real-staff',
    password: 'staff-test-password',
    email: 'staff@example.test',
    role: 'TEACHER',
    employmentType: 'Permanent',
    departmentId: 'cs',
  });
  assert.equal(
    (await auth({ action: 'login', username: 'real-staff', password: 'staff-test-password' }))
      .status,
    200,
  );
  await rejects(() => context(), /Change your password/);
  assert.equal((await context(false, true)).user.id, id);
  assert.equal(
    (
      await auth({
        action: 'change',
        currentPassword: 'staff-test-password',
        newPassword: 'staff-personal-password',
      })
    ).status,
    200,
  );
  assert.equal(
    (await auth({ action: 'login', username: 'real-staff', password: 'staff-personal-password' }))
      .status,
    200,
  );
  assert.equal((await context()).user.id, id);
  await impersonate('lcps-administrator');
  await save(await ctx(), 'users', { id, password: 'staff-reset-password' });
  assert.equal(
    (await auth({ action: 'login', username: 'real-staff', password: 'staff-test-password' }))
      .status,
    401,
  );
  assert.equal(
    (await auth({ action: 'login', username: 'real-staff', password: 'staff-reset-password' }))
      .status,
    200,
  );
  const staffCookie = jar.get('lcps_session')!.value;
  await impersonate('lcps-administrator');
  await save(await ctx(), 'users', { id, active: 0 });
  jar.set('lcps_session', staffCookie);
  await rejects(() => context());
  await impersonate('lcps-administrator');
  await remove(await ctx(), 'users', id);
  assert(!(await all('users')).some((u) => u.id === id));
});
await test('administrator action restrictions are enforced server-side', async () => {
  await save(await ctx(), 'users', { id: 'teacher', permissions: { attendance: false } });
  await rejects(async () =>
    save(await ctx('teacher'), 'attendance', {
      offeringId: 'off-mobile',
      studentId: 'student',
      date: '2026-01-01',
      status: 'Present',
    }),
  );
  await rejects(async () =>
    save(await ctx('teacher'), 'users', { id: 'teacher', permissions: { attendance: true } }),
  );
  await save(await ctx(), 'users', { id: 'teacher', permissions: {} });
});
await test('last real admin cannot deactivate self', async () => {
  const c = await ctx();
  await rejects(() => save(c, 'users', { ...c.actual, active: 0 }), /cannot deactivate/);
});
await test('timetable rejects teacher batch and room overlaps', async () => {
  const c = await ctx();
  await rejects(
    () =>
      save(c, 'timetable', {
        offeringId: 'off-mobile',
        day: 'Monday',
        startTime: '09:15',
        endTime: '10:15',
        room: 'Different room',
      }),
    /conflicts/,
  );
  await save(c, 'timetable', {
    offeringId: 'off-mobile',
    day: 'Saturday',
    startTime: '10:00',
    endTime: '11:00',
    room: 'Lab 7',
  });
});
await test('lecture timetable for a subject is visible to its students, teacher and HOD', async () => {
  const id = await save(await ctx(), 'timetable', {
    offeringId: 'off-mobile',
    day: 'Sunday',
    startTime: '10:00',
    endTime: '11:00',
    room: 'Course catalogue lab',
  });
  for (const userId of ['student', 'teacher', 'hod_cs'])
    assert(payload(await ctx(userId)).data.timetable.some((t) => t.id === id));
  await remove(await ctx(), 'timetable', id);
});
await test('new attendance persists and correction requires a reason', async () => {
  const c = await ctx('teacher');
  const id = await save(c, 'attendance', {
    offeringId: 'off-mobile',
    studentId: 'student',
    date: '2026-01-05',
    status: 'Present',
  });
  await rejects(
    () =>
      save(c, 'attendance', {
        offeringId: 'off-mobile',
        studentId: 'student4',
        date: '2026-01-05',
        status: 'Present',
      }),
    /not enrolled/,
  );
  await rejects(
    async () => save(await ctx('teacher'), 'attendance', { id, status: 'Absent' }),
    /Correcting submitted attendance is disabled/,
  );
  await rejects(async () => save(await ctx(), 'attendance', { id, status: 'Absent' }), /reason/);
  await save(await ctx(), 'attendance', {
    id,
    status: 'Late',
    reason: 'Student arrived after register',
  });
  assert.equal((await all('attendance')).find((x) => x.id === id)?.status, 'Late');
});
await test('attendance report validates the full roster and persists atomically for students', async () => {
  const teacher = await ctx('teacher');
  const roster = teacher.data.enrollments
    .filter((e) => e.offeringId === 'off-mobile' && e.active)
    .map((e) => e.studentId);
  assert(roster.length > 0);
  const records = roster.map((studentId, i) => ({
    studentId,
    status: i === 0 ? 'Absent' : 'Present',
  }));
  const date = '2026-01-06';
  await rejects(
    () =>
      action(teacher, {
        action: 'attendanceSubmit',
        offeringId: 'off-mobile',
        date,
        records: records.slice(1),
      }),
    /each currently enrolled student/,
  );
  assert(!(await all('attendance')).some((a) => a.offeringId === 'off-mobile' && a.date === date));
  await action(teacher, { action: 'attendanceSubmit', offeringId: 'off-mobile', date, records });
  let stored = (await all('attendance')).filter(
    (a) => a.offeringId === 'off-mobile' && a.date === date,
  );
  assert.equal(stored.length, roster.length);
  assert.equal(
    payload(await ctx('student')).data.attendance.find(
      (a) => a.offeringId === 'off-mobile' && a.date === date,
    )?.status,
    records.find((r) => r.studentId === 'student')?.status,
  );
  const corrected = records.map((r, i) => ({ ...r, status: i === 0 ? 'Present' : r.status }));
  await rejects(
    async () =>
      action(await ctx('teacher'), {
        action: 'attendanceSubmit',
        offeringId: 'off-mobile',
        date,
        records: corrected,
        reason: 'Register checked',
      }),
    /Correcting submitted attendance is disabled/,
  );
  await rejects(
    async () =>
      action(await ctx(), {
        action: 'attendanceSubmit',
        offeringId: 'off-mobile',
        date,
        records: corrected,
      }),
    /Explain attendance corrections/,
  );
  await action(await ctx(), {
    action: 'attendanceSubmit',
    offeringId: 'off-mobile',
    date,
    records: corrected,
    reason: 'Register checked',
  });
  stored = (await all('attendance')).filter(
    (a) => a.offeringId === 'off-mobile' && a.date === date,
  );
  assert.equal(stored.length, roster.length);
  assert.equal(stored.find((a) => a.studentId === records[0].studentId)?.status, 'Present');
  assert.equal(
    stored.find((a) => a.studentId === records[0].studentId)?.reason,
    'Register checked',
  );
});
await test('attendance calculation excludes excused, includes late and identifies below-75 values', () => {
  assert.equal(
    attendancePercent([
      { status: 'Present' },
      { status: 'Late' },
      { status: 'Absent' },
      { status: 'Excused' },
    ]),
    67,
  );
  assert.equal(
    attendancePercent([
      { status: 'Present' },
      { status: 'Absent' },
      { status: 'Absent' },
      { status: 'Excused' },
    ]),
    33,
  );
  assert.equal(
    attendancePercent([
      { status: 'Present' },
      { status: 'Present' },
      { status: 'Absent' },
      { status: 'Absent' },
    ]),
    50,
  );
});
await test('attendance viewing is offering-scoped and returns only authorized student records', async () => {
  const student = await ctx('student'),
    studentView = await action(student, { action: 'attendanceView', offeringId: 'off-mobile' });
  assert(studentView.offerings.some((o: Row) => o.id === 'off-mobile'));
  assert(
    studentView.attendance.every(
      (record: Row) => record.studentId === 'student' && record.offeringId === 'off-mobile',
    ),
  );
  assert.equal(studentView.students.length, 1);
  await rejects(
    () => action(student, { action: 'attendanceView', offeringId: 'off-oop' }),
    /not authorized/,
  );
  const teacher = await ctx('teacher'),
    teacherView = await action(teacher, { action: 'attendanceView' });
  assert(
    teacherView.offerings.length > 0 &&
      teacherView.offerings.every((o: Row) => o.teacherId === 'teacher'),
  );
  await rejects(
    () => action(teacher, { action: 'attendanceView', offeringId: 'off-security' }),
    /not authorized/,
  );
  await rejects(
    () =>
      action(teacher, {
        action: 'attendanceView',
        offeringId: 'off-mobile',
        studentId: 'student4',
      }),
    /not authorized/,
  );
  const hod = await ctx('hod_cs'),
    hodView = await action(hod, { action: 'attendanceView' });
  assert(
    hodView.offerings.every(
      (o: Row) => hod.data.batches.find((b) => b.id === o.batchId)?.departmentId === 'cs',
    ),
  );
  const hodClass = await action(hod, {
    action: 'attendanceView',
    offeringId: 'off-mobile',
    studentId: 'student',
  });
  assert.deepEqual(hodClass.attendance, studentView.attendance);
  assert.equal(attendancePercent(hodClass.attendance), attendancePercent(studentView.attendance));
  await rejects(
    () =>
      action(hod, { action: 'attendanceView', offeringId: 'off-mobile', studentId: 'student4' }),
    /not authorized/,
  );
  const missing = await action(teacher, {
    action: 'attendanceView',
    offeringId: 'off-mobile',
    date: '2026-01-07',
  });
  assert.equal(missing.attendance.length, 0);
  assert(missing.students.length > 0);
});
await test('attendance viewing direct API requests reject unassigned offerings and departments', async () => {
  const subjectId = await save(await ctx(), 'subjects', {
      name: 'Attendance department scope test',
      code: 'ATT-SCOPE',
      departmentId: 'pharm',
      credits: 3,
    }),
    offeringId = await save(await ctx(), 'offerings', {
      subjectId,
      batchId: 'ph4',
      teacherId: 'hod_pharmd',
    });
  const request = (body: Row) =>
    postApi(
      new Request('https://portal.test/api/lms', {
        method: 'POST',
        headers: { origin: 'https://portal.test', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as any,
    );
  await impersonate('teacher');
  const allowed = await request({ action: 'attendanceView', offeringId: 'off-mobile' });
  assert.equal(allowed.status, 200);
  const deniedTeacher = await request({ action: 'attendanceView', offeringId: 'off-security' });
  assert.equal(deniedTeacher.status, 403, await deniedTeacher.text());
  await impersonate('hod_cs');
  const deniedHod = await request({ action: 'attendanceView', offeringId });
  assert.equal(deniedHod.status, 403, await deniedHod.text());
  await impersonate('hod_pharmd');
  assert.equal((await request({ action: 'attendanceView', offeringId })).status, 200);
  await impersonate('student');
  assert.equal((await request({ action: 'attendanceView', offeringId })).status, 403);
  await impersonate('lcps-administrator');
  await remove(await ctx(), 'offerings', offeringId);
  await remove(await ctx(), 'subjects', subjectId);
});
await test('assignment submission grading and student feedback round trip', async () => {
  await action(await ctx('student'), {
    action: 'submit',
    assignmentId: 'a1',
    content: 'My Android source code',
    fileId: null,
  });
  let c = await ctx('teacher');
  const s = c.data.submissions.find((s) => s.assignmentId === 'a1')!;
  await action(c, { action: 'grade', id: s.id, marks: 18, feedback: 'Well structured.' });
  const st = payload(await ctx('student')).data.submissions[0];
  assert.equal(st.marks, 18);
  assert.equal(st.feedback, 'Well structured.');
  await rejects(
    async () =>
      action(await ctx('student'), { action: 'submit', assignmentId: 'a1', content: 'Overwrite' }),
    /graded/,
  );
});
await test('new teacher assignments are published and appear in enrolled students’ portal', async () => {
  const teacher = await ctx('teacher'),
    id = await save(teacher, 'assignments', {
      offeringId: 'off-mobile',
      title: 'Visible class assignment',
      instructions: 'Complete the attached exercise.',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      maxMarks: 20,
    });
  assert.equal((await all('assignments')).find((a) => a.id === id)?.published, 1);
  assert(payload(await ctx('student')).data.assignments.some((a) => a.id === id));
  await remove(await ctx('teacher'), 'assignments', id);
});
await test('assignment deadline rejects submissions even when legacy late-submission flag is set', async () => {
  const id = await save(await ctx('teacher'), 'assignments', {
    offeringId: 'off-mobile',
    title: 'Closed class assignment',
    instructions: 'This deadline has passed.',
    dueDate: '2020-01-01T00:00:00.000Z',
    maxMarks: 20,
    allowLate: 1,
  });
  await rejects(
    async () =>
      action(await ctx('student'), { action: 'submit', assignmentId: id, content: 'Late work' }),
    /deadline has passed/,
  );
  await remove(await ctx('teacher'), 'assignments', id);
});
await test('draft result invisible until publication', async () => {
  const id = await save(await ctx('teacher'), 'results', {
    offeringId: 'off-mobile',
    studentId: 'student',
    title: 'Private assessment',
    marks: 8,
    maxMarks: 10,
    published: 0,
  });
  assert(!payload(await ctx('student')).data.results.some((r) => r.id === id));
  await save(await ctx('teacher'), 'results', { id, published: 1 });
  assert(payload(await ctx('student')).data.results.some((r) => r.id === id));
});
await test('HOD publishes results for every student in a department subject roster', async () => {
  const hod = await ctx('hod_cs'),
    roster = hod.data.enrollments
      .filter((e) => e.offeringId === 'off-security' && e.active)
      .map((e) => e.studentId);
  await action(hod, {
    action: 'resultBatch',
    offeringId: 'off-security',
    title: 'Department assessment',
    maxMarks: 20,
    published: true,
    records: roster.map((studentId) => ({ studentId, marks: 17 })),
  });
  assert.equal(
    (await all('results')).filter(
      (r) => r.offeringId === 'off-security' && r.title === 'Department assessment',
    ).length,
    roster.length,
  );
  assert(
    payload(await ctx('student')).data.results.some((r) => r.title === 'Department assessment'),
  );
  await rejects(async () =>
    action(await ctx('hod_pharmd'), {
      action: 'resultBatch',
      offeringId: 'off-mobile',
      title: 'Out of department',
      maxMarks: 20,
      published: true,
      records: roster.map((studentId) => ({ studentId, marks: 17 })),
    }),
  );
});
await test('HOD results cover department while assignments and quizzes remain personal', async () => {
  const hod = await ctx('hod_cs');
  assert(
    hod.data.offerings.some((o) => o.id === 'off-mobile') &&
      hod.data.offerings.some((o) => o.id === 'off-security'),
  );
  await rejects(() =>
    save(hod, 'assignments', {
      offeringId: 'off-mobile',
      title: 'Other teacher assignment',
      instructions: 'Not allowed.',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      maxMarks: 20,
    }),
  );
  await rejects(() =>
    save(hod, 'quizzes', { offeringId: 'off-mobile', title: 'Other teacher quiz' }),
  );
  const departmentResult = await save(hod, 'results', {
    offeringId: 'off-mobile',
    studentId: 'student',
    title: 'Other teacher result',
    marks: 5,
    maxMarks: 10,
  });
  await remove(await ctx('hod_cs'), 'results', departmentResult);
  await rejects(() => remove(hod, 'assignments', 'a1'));
  const assignmentId = await save(hod, 'assignments', {
    offeringId: 'off-security',
    title: 'HOD personal assignment',
    instructions: 'Complete the exercise.',
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    maxMarks: 10,
  });
  await remove(await ctx('hod_cs'), 'assignments', assignmentId);
  const quizId = await save(await ctx('hod_cs'), 'quizzes', {
    offeringId: 'off-security',
    title: 'HOD personal quiz',
  });
  await remove(await ctx('hod_cs'), 'quizzes', quizId);
  const resultId = await save(await ctx('hod_cs'), 'results', {
    offeringId: 'off-security',
    studentId: 'student',
    title: 'HOD personal result',
    marks: 8,
    maxMarks: 10,
    published: 0,
  });
  await remove(await ctx('hod_cs'), 'results', resultId);
  const teacherResultId = await save(await ctx('teacher'), 'results', {
    offeringId: 'off-mobile',
    studentId: 'student',
    title: 'Teacher deletable result',
    marks: 8,
    maxMarks: 10,
    published: 0,
  });
  await remove(await ctx('teacher'), 'results', teacherResultId);
});

await test('semester offerings auto-enroll existing and newly created students', async () => {
  const admin = await ctx(),
    studentId = await save(admin, 'users', {
      name: 'Semester test student',
      username: 'semester-test-student',
      password: 'student-test-password',
      role: 'STUDENT',
      departmentId: 'cs',
      batchId: 'cs2',
    });
  assert(
    (await all('enrollments')).some((e) => e.studentId === studentId && e.offeringId === 'off-oop'),
  );
  assert(payload(await ctx(studentId)).data.offerings.some((o) => o.id === 'off-oop'));
  const subjectId = await save(await ctx(), 'subjects', {
      name: 'Semester enrollment test',
      code: 'SEM-TEST',
      departmentId: 'cs',
      credits: 3,
    }),
    offeringId = await save(await ctx(), 'offerings', {
      subjectId,
      batchId: 'cs2',
      teacherId: 'teacher',
    });
  assert(
    (await all('enrollments')).some(
      (e) => e.studentId === 'student3' && e.offeringId === offeringId,
    ),
  );
  assert(
    (await all('enrollments')).some(
      (e) => e.studentId === studentId && e.offeringId === offeringId,
    ),
  );
  await remove(await ctx(), 'offerings', offeringId);
  await remove(await ctx(), 'subjects', subjectId);
  await remove(await ctx(), 'users', studentId);
});
await test('semester subject assignment creates offerings and enrolls the whole batch in one action', async () => {
  const first = await save(await ctx(), 'subjects', {
      name: 'Bulk semester subject one',
      code: 'BULK-1',
      departmentId: 'cs',
      credits: 3,
    }),
    second = await save(await ctx(), 'subjects', {
      name: 'Bulk semester subject two',
      code: 'BULK-2',
      departmentId: 'cs',
      credits: 3,
    }),
    admin = await ctx(),
    students = admin.data.users.filter(
      (student) => student.role === 'STUDENT' && student.active && student.batchId === 'cs2',
    ),
    result = await action(admin, {
      action: 'assignSemesterSubjects',
      batchId: 'cs2',
      subjects: [
        { subjectId: first, teacherId: 'teacher' },
        { subjectId: second, teacherId: 'hod_cs' },
      ],
    });
  assert.deepEqual(result, { created: 2, enrolled: students.length * 2 });
  const offerings = (await all('offerings')).filter(
    (offering) => [first, second].includes(offering.subjectId) && offering.batchId === 'cs2',
  );
  assert.equal(offerings.length, 2);
  for (const offering of offerings) {
    assert.equal(
      (await all('enrollments')).filter(
        (enrollment) => enrollment.offeringId === offering.id && enrollment.active,
      ).length,
      students.length,
    );
  }
  assert(
    payload(await ctx('student3')).data.offerings.some((offering) =>
      offerings.some((created) => created.id === offering.id),
    ),
  );
  await remove(await ctx(), 'offerings', offerings[0].id);
  await remove(await ctx(), 'offerings', offerings[1].id);
  await remove(await ctx(), 'subjects', first);
  await remove(await ctx(), 'subjects', second);
});
await test('HOD can delete wrong department announcements', async () => {
  const hod = await ctx('hod_cs');
  await remove(hod, 'announcements', 'ann2');
  assert(!(await all('announcements')).some((a) => a.id === 'ann2'));
});
await test('removing one HOD-managed student preserves peers’ class work', async () => {
  await action(await ctx('student2'), {
    action: 'submit',
    assignmentId: 'a1',
    content: 'Keep this class submission',
  });
  const hod = await ctx('hod_cs'),
    studentId = await save(hod, 'users', {
      name: 'Temporary classmate',
      username: 'temporary-classmate',
      password: 'student-test-password',
      role: 'STUDENT',
      departmentId: 'cs',
      batchId: 'cs4',
    });
  await remove(await ctx('hod_cs'), 'users', studentId);
  assert(!(await all('users')).some((u) => u.id === studentId));
  assert(
    (await all('submissions')).some((s) => s.studentId === 'student2' && s.assignmentId === 'a1'),
  );
});
await test('online quiz actions are disabled while teachers can publish topics', async () => {
  for (const actionName of ['quizStart', 'quizSave', 'quizSubmit'])
    await rejects(
      async () => action(await ctx('student'), { action: actionName, id: 'quiz1' }),
      /Online quizzes are disabled/,
    );
  const c = await ctx('teacher');
  await save(c, 'quizzes', { id: 'quiz1', topic: 'Review Android activities and layouts' });
  assert.equal(
    (await all('quizzes')).find((q) => q.id === 'quiz1')?.topic,
    'Review Android activities and layouts',
  );
  assert.equal((await all('attempts')).length, 0);
});
await test('resource completion is persistent and scoped', async () => {
  await action(await ctx('student'), { action: 'progress', id: 'mat-off-mobile', completed: true });
  assert(payload(await ctx('student')).data.progress.some((p) => p.completed));
  await rejects(async () =>
    action(await ctx('student'), { action: 'progress', id: 'mat-off-oop', completed: true }),
  );
});
await test('announcement audience filters enforce class and department boundaries', async () => {
  await save(await ctx('hod_pharmd'), 'announcements', {
    title: 'Pharmacy only',
    body: 'Department meeting',
    departmentId: 'pharm',
  });
  assert(
    !payload(await ctx('student')).data.announcements.some((a) => a.title === 'Pharmacy only'),
  );
});
await test('retired office tasks cannot be updated', async () => {
  await rejects(
    async () => save(await ctx(), 'tasks', { id: 'task1', status: 'Completed' }),
    /retired/,
  );
});
await test('nonowner cannot use demo role switch', async () => {
  const c = await ctx('student');
  await rejects(() => action({ ...c, isOwner: false }, { action: 'preview', userId: 'admin' }));
});
await test('audit log records sensitive changes and stays admin only', async () => {
  assert((await all('audit')).length > 5);
  assert.equal(payload(await ctx('student')).data.audit.length, 0);
  assert(payload(await ctx()).data.audit.length > 0);
});

await test('mutation API rejects foreign origins', async () => {
  const res = await postApi(
    new Request('https://portal.test/api/lms', {
      method: 'POST',
      headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'preview', userId: 'admin' }),
    }) as any,
  );
  assert.equal(res.status, 403);
});
await test('profile image upload uses durable bucket and authenticated download', async () => {
  await impersonate('student');
  const form = new FormData();
  form.append('purpose', 'avatar');
  form.append(
    'file',
    new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'profile.png', {
      type: 'image/png',
    }),
  );
  const res = await uploadFile(
    new Request('https://portal.test/api/files', {
      method: 'POST',
      headers: { origin: 'https://portal.test' },
      body: form,
    }) as any,
  );
  if (res.status !== 200) throw new Error('Profile upload failed: ' + (await res.text()));
  const json = (await res.json()) as any;
  assert.equal((await ctx('student')).user.avatar, json.id);
  const download = await getFile(new Request('https://portal.test/api/files/' + json.id), {
    params: Promise.resolve({ id: json.id }),
  });
  if (download.status !== 200)
    throw new Error('Profile download failed: ' + (await download.text()));
  assert.equal(download.headers.get('Content-Type'), 'image/png');
  await impersonate('student4');
  const denied = await getFile(new Request('https://portal.test/api/files/' + json.id), {
    params: Promise.resolve({ id: json.id }),
  });
  assert.equal(denied.status, 403);
  await impersonate('lcps-administrator');
});
await test('only admins and in-department HODs can upload batch-scoped timetables', async () => {
  const uploadRequest = async (userId: string, batchId: string) => {
    await impersonate(userId);
    const form = new FormData();
    form.append('purpose', 'timetable');
    form.append('batchId', batchId);
    form.append(
      'file',
      new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], 'timetable.png', {
        type: 'image/png',
      }),
    );
    return uploadFile(
      new Request('https://portal.test/api/files', {
        method: 'POST',
        headers: { origin: 'https://portal.test' },
        body: form,
      }) as any,
    );
  };
  assert.equal((await uploadRequest('teacher', 'cs4')).status, 403);
  assert.equal((await uploadRequest('hod_pharmd', 'cs4')).status, 403);
  const response = await uploadRequest('hod_cs', 'cs4');
  assert.equal(response.status, 200, await response.clone().text());
  const file = (await response.json()) as any;
  await impersonate('student');
  const studentView = await getFile(
    new Request(`https://portal.test/api/files/${file.id}?view=1`),
    { params: Promise.resolve({ id: file.id }) },
  );
  assert.equal(studentView.status, 200);
  assert.match(studentView.headers.get('Content-Disposition') || '', /^inline/);
  await impersonate('teacher');
  assert.equal(
    (
      await getFile(new Request(`https://portal.test/api/files/${file.id}`), {
        params: Promise.resolve({ id: file.id }),
      })
    ).status,
    200,
  );
  await impersonate('student4');
  assert.equal(
    (
      await getFile(new Request(`https://portal.test/api/files/${file.id}`), {
        params: Promise.resolve({ id: file.id }),
      })
    ).status,
    403,
  );
  const timetable = (await all('timetableFiles')).find((item) => item.fileId === file.id)!;
  await impersonate('hod_cs');
  await remove(await ctx('hod_cs'), 'timetableFiles', timetable.id);
  assert(!(await all('timetableFiles')).some((item) => item.id === timetable.id));
  assert(!(await all('files')).some((item) => item.id === file.id));
  assert.equal(
    (
      await getFile(new Request(`https://portal.test/api/files/${file.id}`), {
        params: Promise.resolve({ id: file.id }),
      })
    ).status,
    404,
  );
  await impersonate('lcps-administrator');
});
await test('result sheets and department assessment policies have role and department boundaries', async () => {
  const upload = async (userId: string, purpose: string, field: string, value: string) => {
    await impersonate(userId);
    const form = new FormData();
    form.append('purpose', purpose);
    form.append(field, value);
    form.append('file', new File(['student,mark\nA,90\n'], 'marks.csv', { type: 'text/csv' }));
    return uploadFile(
      new Request('https://portal.test/api/files', {
        method: 'POST',
        headers: { origin: 'https://portal.test' },
        body: form,
      }) as any,
    );
  };
  const result = await upload('teacher', 'result-sheet', 'offeringId', 'off-mobile');
  assert.equal(result.status, 200, await result.clone().text());
  const resultFile = (await result.json()) as any;
  assert.equal((await upload('student', 'result-sheet', 'offeringId', 'off-mobile')).status, 403);
  assert.equal(
    (await upload('hod_pharmd', 'result-sheet', 'offeringId', 'off-mobile')).status,
    403,
  );
  const departmentSheet = await upload('hod_cs', 'result-sheet', 'offeringId', 'off-mobile');
  assert.equal(departmentSheet.status, 200);
  resultFile.id = (await departmentSheet.json()).id;
  const hodResult = await upload('hod_cs', 'result-sheet', 'offeringId', 'off-security');
  assert.equal(hodResult.status, 200, await hodResult.clone().text());
  await impersonate('student');
  assert.equal(
    (
      await getFile(new Request(`https://portal.test/api/files/${resultFile.id}`), {
        params: Promise.resolve({ id: resultFile.id }),
      })
    ).status,
    200,
  );
  const policy = await upload('hod_cs', 'assessment-policy', 'departmentId', 'cs');
  assert.equal(policy.status, 200, await policy.clone().text());
  const policyFile = (await policy.json()) as any;
  assert.equal((await upload('hod_pharmd', 'assessment-policy', 'departmentId', 'cs')).status, 403);
  await impersonate('student');
  assert.equal(
    (
      await getFile(new Request(`https://portal.test/api/files/${policyFile.id}`), {
        params: Promise.resolve({ id: policyFile.id }),
      })
    ).status,
    200,
  );
  await impersonate('lcps-administrator');
});
await test('Office, spreadsheet, CSV and ZIP attachments upload with safe preview and download behavior', async () => {
  await impersonate('teacher');
  const samples = [
    [
      'reference.docx',
      [0x50, 0x4b, 0x03, 0x04, 0, 0],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'grades.xlsx',
      [0x50, 0x4b, 0x03, 0x04, 0, 0],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    ['archive.zip', [0x50, 0x4b, 0x03, 0x04, 0, 0], 'application/zip'],
    ['table.csv', 'student,mark\nA,90\n', 'text/csv'],
  ];
  const ids: string[] = [];
  for (const [name, content, mime] of samples) {
    const form = new FormData();
    const part = typeof content === 'string' ? content : Uint8Array.from(content as number[]);
    form.append('file', new File([part], name as string, { type: mime as string }));
    const res = await uploadFile(
      new Request('https://portal.test/api/files', {
        method: 'POST',
        headers: { origin: 'https://portal.test' },
        body: form,
      }) as any,
    );
    assert.equal(res.status, 200, await res.clone().text());
    const uploaded = (await res.json()) as any;
    assert.equal(uploaded.mime, mime);
    ids.push(uploaded.id);
  }
  const doc = await getFile(new Request(`https://portal.test/api/files/${ids[0]}?metadata=1`), {
    params: Promise.resolve({ id: ids[0] }),
  });
  assert.deepEqual(await doc.json(), {
    id: ids[0],
    name: 'reference.docx',
    mime: samples[0][2],
    size: 6,
    preview: false,
  });
  const download = await getFile(new Request(`https://portal.test/api/files/${ids[0]}`), {
    params: Promise.resolve({ id: ids[0] }),
  });
  assert.match(download.headers.get('Content-Disposition') || '', /^attachment/);
  const preview = await getFile(new Request(`https://portal.test/api/files/${ids[3]}?view=1`), {
    params: Promise.resolve({ id: ids[3] }),
  });
  assert.match(preview.headers.get('Content-Disposition') || '', /^inline/);
  const pdfForm = new FormData();
  pdfForm.append('file', new File(['%PDF-1.4 content'], 'guide.pdf', { type: 'application/pdf' }));
  const pdfUpload = await uploadFile(
    new Request('https://portal.test/api/files', {
      method: 'POST',
      headers: { origin: 'https://portal.test' },
      body: pdfForm,
    }) as any,
  );
  const pdf = (await pdfUpload.json()) as any;
  const attached = await save(await ctx('teacher'), 'quizzes', { id: 'quiz1', fileId: pdf.id });
  assert.equal(attached, 'quiz1');
  await impersonate('student');
  const studentPreview = await getFile(
    new Request(`https://portal.test/api/files/${pdf.id}?view=1`),
    { params: Promise.resolve({ id: pdf.id }) },
  );
  assert.equal(studentPreview.status, 200);
  assert.match(studentPreview.headers.get('Content-Disposition') || '', /^inline/);
  await impersonate('lcps-administrator');
});
await test('executable or mislabeled file uploads rejected', async () => {
  const form = new FormData();
  form.append('file', new File(['<script>alert(1)</script>'], 'fake.png', { type: 'image/png' }));
  const res = await uploadFile(
    new Request('https://portal.test/api/files', {
      method: 'POST',
      headers: { origin: 'https://portal.test' },
      body: form,
    }) as any,
  );
  assert.equal(res.status, 400);
});
console.log(`\n${passed} integration checks passed.`);
const policy = validateGrading({
  name: 'Test policy only',
  maxPoints: 4,
  attendanceMinimum: 75,
  assessments: [
    { title: 'Midterm', weight: 40 },
    { title: 'Final', weight: 60 },
  ],
  bands: [
    { min: 0, grade: 'F', points: 0 },
    { min: 50, grade: 'C', points: 2 },
    { min: 70, grade: 'B', points: 3 },
    { min: 85, grade: 'A', points: 4 },
  ],
});
await test('grading validates weights and withholds grades for incomplete results', () => {
  assert.throws(
    () => validateGrading({ ...policy, assessments: [{ title: 'Final', weight: 50 }] }),
    /100/,
  );
  assert.equal(
    courseGrade(policy, [{ title: 'Midterm', marks: 40, maxMarks: 50, published: 1 }]).complete,
    false,
  );
  const g = courseGrade(policy, [
    { title: 'Midterm', marks: 40, maxMarks: 50, published: 1 },
    { title: 'Final', marks: 90, maxMarks: 100, published: 1 },
  ]);
  assert.equal(g.percentage, 86);
  assert.equal(g.grade, 'A');
  assert.equal(g.points, 4);
  assert.equal(courseGrade(null, []).complete, false);
});
await test('lab grading supports 20-mark lab-only and theory-plus-lab courses', () => {
  const labOnly = courseGrade(policy, [{ title: 'Lab', marks: 15, maxMarks: 20, published: 1 }], {
      subjectType: 'Lab',
    }),
    theoryWithLab = courseGrade(
      policy,
      [
        { title: 'Midterm', marks: 40, maxMarks: 50, published: 1 },
        { title: 'Final', marks: 90, maxMarks: 100, published: 1 },
        { title: 'Lab', marks: 15, maxMarks: 20, published: 1 },
      ],
      { subjectType: 'Theory', hasLab: 1 },
    );
  assert.equal(labOnly.percentage, 75);
  assert.equal(labOnly.grade, 'B');
  assert.equal(theoryWithLab.percentage, 83.8);
  assert.equal(theoryWithLab.grade, 'B');
  assert.equal(
    courseGrade(policy, [{ title: 'Lab', marks: 15, maxMarks: 15, published: 1 }], {
      subjectType: 'Lab',
    }).complete,
    false,
  );
});
await test('learning resource categories enforce file formats and upload caps', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\n'),
    png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(inspectResourceUpload('lecture.pdf', pdf, 'Slides'), 'application/pdf');
  assert.equal(inspectResourceUpload('lecture.pdf', pdf, 'Image'), null);
  assert.equal(inspectResourceUpload('cover.png', png, 'Image'), 'image/png');
  assert.equal(resourceExtensionAllowed('book.zip', 'Book'), true);
  assert.equal(resourceExtensionAllowed('book.zip', 'Slides'), false);
  assert.equal(resourceMimeAllowed('application/zip', 'Book'), true);
  assert.equal(resourceMimeAllowed('application/zip', 'Document'), false);
  assert.equal(maxUploadBytes, 4 * 1024 * 1024);
  assert.equal(maxBookUploadBytes, 25 * 1024 * 1024);
});
await test('only admin configures policy and incomplete semesters have no GPA', async () => {
  await impersonate('lcps-administrator');
  await rejects(async () => action(await ctx('student'), { action: 'grading', policy }));
  await action(await ctx(), { action: 'grading', policy });
  assert.equal(
    JSON.parse((await stmt("SELECT value FROM settings WHERE key='grading'").first<any>())!.value)
      .name,
    policy.name,
  );
  assert.equal(transcript('student', (await ctx()).data, policy)[0].gpa, null);
});
await test('published result corrections require a reason and retain old marks in audit', async () => {
  const c = await ctx();
  const r = c.data.results.find((r) => r.published)!;
  const marks = r.marks > 0 ? r.marks - 1 : r.marks + 1;
  await rejects(() => save(c, 'results', { id: r.id, marks }), /Explain the correction/);
  await save(c, 'results', { id: r.id, marks, correctionReason: 'Rechecked the answer paper' });
  const log = (await all('audit'))
    .filter((a) => a.entity === 'results' && a.recordId === r.id)
    .at(-1)!;
  assert.equal(JSON.parse(log.detail).before.marks, r.marks);
});
await test('database rejects overlapping timetable writes even with a stale context', async () => {
  const stale = await ctx();
  await save(stale, 'timetable', {
    offeringId: 'off-mobile',
    day: 'Sunday',
    startTime: '08:00',
    endTime: '09:00',
    room: 'Concurrency lab',
  });
  await rejects(
    () =>
      save(stale, 'timetable', {
        offeringId: 'off-mobile',
        day: 'Sunday',
        startTime: '08:30',
        endTime: '09:30',
        room: 'Other lab',
      }),
    /Timetable conflict/,
  );
});
await test('graded assignment cannot be overwritten through a stale request', async () => {
  const c = await ctx('student');
  const stale = { ...c, data: { ...c.data, submissions: [] } };
  await rejects(
    () => action(stale, { action: 'submit', assignmentId: 'a1', content: 'Stale overwrite' }),
    /graded/,
  );
});
await test('online quiz actions remain disabled for stale requests', async () => {
  const c = await ctx('student'),
    stale = { ...c, data: { ...c.data, attempts: [] } };
  await rejects(
    () => action(stale, { action: 'quizSubmit', id: 'quiz1', answers: {} }),
    /Online quizzes are disabled/,
  );
});
await test('backup is admin-only and restore verifies password and backup integrity', async () => {
  await rejects(async () => createBackup(await ctx('student')));
  await impersonate('lcps-administrator');
  const c = await ctx();
  const id = await createBackup(c);
  assert((await listBackups(c)).some((b) => b.id === id));
  await rejects(() => restoreBackup(c, id, 'wrong-password', 'RESTORE'), /incorrect/);
  const key = 'private-backups/managed/' + id,
    object = await env.BUCKET.get(key),
    body = await object.text();
  await env.BUCKET.put(key, body + ' ', { customMetadata: object.customMetadata });
  await rejects(() => restoreBackup(c, id, 'new-test-password', 'RESTORE'), /integrity/);
  await env.BUCKET.put(key, body, { customMetadata: object.customMetadata });
});
await test('restore round-trip rolls back invalid records and restores a valid snapshot', async () => {
  await impersonate('lcps-administrator');
  const c = await ctx(),
    id = await createBackup(c),
    key = 'private-backups/managed/' + id,
    object = await env.BUCKET.get(key),
    original = await object.text();
  await save(c, 'departments', { id: 'cs', name: 'Changed after backup' });
  const damaged = JSON.parse(original);
  damaged.data.users.find((u: any) => u.id === 'student').departmentId = 'missing-department';
  const body = JSON.stringify(damaged);
  await env.BUCKET.put(key, body, {
    customMetadata: { ...object.customMetadata, checksum: await digest(body) },
  });
  await rejects(() => restoreBackup(c, id, 'new-test-password', 'RESTORE'));
  assert.equal((await all('departments')).find((d) => d.id === 'cs')!.name, 'Changed after backup');
  await env.BUCKET.put(key, original, { customMetadata: object.customMetadata });
  await restoreBackup(c, id, 'new-test-password', 'RESTORE');
  assert.equal((await all('departments')).find((d) => d.id === 'cs')!.name, 'Computer Science');
  await rejects(() => context());
  assert.equal(
    (await auth({ action: 'login', username: 'ahsanhanif', password: 'new-test-password' })).status,
    200,
  );
});
await test('student SQL loading excludes other students and unrelated offerings', async () => {
  await impersonate('student');
  const c = await context();
  assert(c.data.attendance.every((a) => a.studentId === 'student'));
  assert(c.data.submissions.every((a) => a.studentId === 'student'));
  assert(c.data.results.every((a) => a.studentId === 'student' && a.published));
  assert(
    c.data.assignments.every((a) =>
      c.data.enrollments.some((e) => e.studentId === 'student' && e.offeringId === a.offeringId),
    ),
  );
  await impersonate('lcps-administrator');
});
await test('login rate limit survives repeated requests', async () => {
  for (let i = 0; i < 11; i++)
    await auth({ action: 'login', username: 'missing', password: 'invalid-test-password' });
  assert.equal(
    (await auth({ action: 'login', username: 'missing', password: 'invalid-test-password' }))
      .status,
    429,
  );
  await stmt('DELETE FROM loginLimits').run();
});
await test('expired sessions are rejected', async () => {
  await impersonate('lcps-administrator');
  const value = jar.get('lcps_session')!.value;
  await stmt('UPDATE loginSessions SET expires=0 WHERE tokenHash=?', [await digest(value)]).run();
  await rejects(() => context());
});
await test('role privileges matrix can be customized, extended with new privileges and persists in settings', async () => {
  await impersonate('lcps-administrator');
  const admin = await ctx();
  await impersonate('teacher');
  await rejects(
    async () =>
      action(await ctx('teacher'), {
        action: 'saveRolePrivileges',
        privileges: [],
        rolePermissions: {},
      }),
    /Only authorized access managers/,
  );
  await impersonate('lcps-administrator');
  const initialPrivs = admin.rolePrivileges.privileges;
  assert(initialPrivs.some((p: any) => p.key === 'attendance'));
  const addResult = await action(admin, {
    action: 'addPrivilege',
    key: 'fee_vouchers',
    label: 'Fee Vouchers',
    description: 'Manage student fee receipts',
    initialRoles: ['TEACHER'],
  });
  assert(addResult.rolePrivileges.privileges.some((p: any) => p.key === 'fee_vouchers'));
  assert(addResult.rolePrivileges.rolePermissions.TEACHER.includes('fee_vouchers'));
  assert(!addResult.rolePrivileges.rolePermissions.STUDENT.includes('fee_vouchers'));
  await save(await ctx(), 'users', { id: 'teacher', permissions: { fee_vouchers: true } });
  const updatedStaff = (await all('users')).find((u) => u.id === 'teacher');
  assert(JSON.parse(updatedStaff?.permissions || '{}').fee_vouchers === true);
  await rejects(
    async () => action(await ctx(), { action: 'deletePrivilege', key: 'attendance' }),
    /Built-in/,
  );
  const delResult = await action(await ctx(), { action: 'deletePrivilege', key: 'fee_vouchers' });
  assert(!delResult.rolePrivileges.privileges.some((p: any) => p.key === 'fee_vouchers'));
  assert(!delResult.rolePrivileges.rolePermissions.TEACHER.includes('fee_vouchers'));
  const resetResult = await action(await ctx(), { action: 'resetRolePrivileges' });
  assert.equal(resetResult.rolePrivileges.privileges.length, initialPrivs.length);
});
await test('individual overrides persist, deny backend writes, inherit again, and cannot elevate scope', async () => {
  await impersonate('lcps-administrator');
  let admin = await ctx();
  const teacher = admin.data.users.find((u) => u.id === 'teacher')!;
  const before = teacher.permissions || '{}';
  await action(admin, {
    action: 'saveUserPrivileges',
    userId: 'teacher',
    expectedPermissions: before,
    permissions: { attendance: false, view_materials: false },
  });
  let tc = await ctx('teacher');
  assert.equal(JSON.parse(tc.user.permissions).attendance, false);
  assert.equal(payload(tc).data.materials.length, 0);
  await rejects(
    () =>
      action(tc, {
        action: 'attendanceSubmit',
        offeringId: 'off-mobile',
        date: '2026-01-01',
        records: [],
      }),
    /permission/,
  );
  await rejects(
    () =>
      action(tc, {
        action: 'saveUserPrivileges',
        userId: 'student',
        expectedPermissions: '{}',
        permissions: { users: true },
      }),
    /Only authorized access managers/,
  );
  await rejects(
    () =>
      action(admin, {
        action: 'saveUserPrivileges',
        userId: 'teacher',
        expectedPermissions: before,
        permissions: {},
      }),
    /changed elsewhere/,
  );
  await rejects(
    () =>
      action(admin, {
        action: 'saveUserPrivileges',
        userId: 'lcps-administrator',
        expectedPermissions: '{}',
        permissions: { users: false },
      }),
    /protected/,
  );
  await rejects(
    () =>
      action(admin, {
        action: 'saveUserPrivileges',
        userId: 'student',
        expectedPermissions: '{}',
        permissions: { unknown_access: true },
      }),
    /Invalid/,
  );
  admin = await ctx();
  await action(admin, {
    action: 'saveUserPrivileges',
    userId: 'teacher',
    expectedPermissions: tc.user.permissions,
    permissions: {},
  });
  tc = await ctx('teacher');
  assert.deepEqual(JSON.parse(tc.user.permissions), {});
  const config = structuredClone(admin.rolePrivileges);
  config.rolePermissions.TEACHER = config.rolePermissions.TEACHER.filter((k) => k !== 'attendance');
  await action(admin, {
    action: 'saveRolePrivileges',
    ...config,
    expectedConfig: JSON.stringify(admin.rolePrivileges),
  });
  tc = await ctx('teacher');
  await rejects(
    () =>
      action(tc, {
        action: 'attendanceSubmit',
        offeringId: 'off-mobile',
        date: '2026-01-01',
        records: [],
      }),
    /permission/,
  );
  await action(await ctx(), {
    action: 'saveUserPrivileges',
    userId: 'teacher',
    expectedPermissions: '{}',
    permissions: { attendance: true },
  });
  const { permitted } = await import('../security/privileges');
  tc = await ctx('teacher');
  assert(permitted(tc.user, 'attendance', tc.rolePrivileges));
  const other = await ctx('student');
  assert(!permitted(other.user, 'attendance', other.rolePrivileges));
  await rejects(() =>
    save(tc, 'materials', {
      offeringId: 'off-security',
      title: 'Not my class',
      kind: 'Note',
      url: 'https://example.com',
    }),
  );
  await action(await ctx(), {
    action: 'saveUserPrivileges',
    userId: 'teacher',
    expectedPermissions: tc.user.permissions,
    permissions: {},
  });
  await action(await ctx(), { action: 'resetRolePrivileges' });
  assert(
    (await all('audit')).some(
      (a) => a.entity === 'user-privileges' && JSON.parse(a.detail).after.attendance === false,
    ),
  );
});
await test('module denial blocks attendance API and student submission even when action is allowed', async () => {
  await impersonate('lcps-administrator');
  const admin = await ctx(),
    student = admin.data.users.find((u) => u.id === 'student')!;
  await action(admin, {
    action: 'saveUserPrivileges',
    userId: 'student',
    expectedPermissions: student.permissions || '{}',
    permissions: { view_attendance: false, view_assignments: false, submit_assignments: true },
  });
  const c = await ctx('student');
  await rejects(() => action(c, { action: 'attendanceView' }), /permission/);
  await rejects(
    () => action(c, { action: 'submit', assignmentId: 'a1', content: 'test' }),
    /permission/,
  );
  assert.equal(payload(c).data.attendance.length, 0);
  assert.equal(payload(c).data.assignments.length, 0);
  assert.equal(payload(c).data.submissions.length, 0);
  await action(await ctx(), {
    action: 'saveUserPrivileges',
    userId: 'student',
    expectedPermissions: c.user.permissions,
    permissions: {},
  });
});
await test('malformed role mappings and missing built-ins are rejected', async () => {
  const c = await ctx();
  await rejects(
    () =>
      action(c, {
        action: 'saveRolePrivileges',
        privileges: c.rolePrivileges.privileges,
        rolePermissions: { TEACHER: ['not_real'] },
      }),
    /Invalid/,
  );
  await rejects(
    () =>
      action(c, {
        action: 'saveRolePrivileges',
        privileges: [{ key: 'only', label: 'Only' }],
        rolePermissions: {},
      }),
    /Built-in/,
  );
});
await test('revoked upload permission is enforced for authenticated HTTP requests', async () => {
  await impersonate('lcps-administrator');
  let c = await ctx();
  const hod = c.data.users.find((u) => u.id === 'hod_cs')!;
  await action(c, {
    action: 'saveUserPrivileges',
    userId: hod.id,
    expectedPermissions: hod.permissions || '{}',
    permissions: { timetable: false, results: false },
  });
  await impersonate(hod.id);
  const { POST: upload } = await import('../app/api/files/route');
  for (const purpose of ['timetable', 'result-sheet', 'assessment-policy']) {
    const form = new FormData();
    form.set('purpose', purpose);
    form.set('file', new File(['test'], 'test.csv', { type: 'text/csv' }));
    const response = await upload(
      new Request('https://portal.test/api/files', {
        method: 'POST',
        headers: { origin: 'https://portal.test' },
        body: form,
      }) as any,
    );
    assert.equal(response.status, 403);
  }
  await impersonate('lcps-administrator');
  c = await ctx();
  await action(c, {
    action: 'saveUserPrivileges',
    userId: hod.id,
    expectedPermissions: c.data.users.find((u) => u.id === hod.id)!.permissions,
    permissions: {},
  });
});
await test('legacy role configuration gains view permissions without resetting existing denials', async () => {
  const { normalizeRolePrivileges, defaultPrivileges, permitted } = await import(
    '../security/privileges'
  );
  const legacy = {
    privileges: defaultPrivileges.filter(
      (p) =>
        !p.key.startsWith('view_') && !['submit_assignments', 'learning_progress'].includes(p.key),
    ),
    rolePermissions: { TEACHER: ['assignments'], STUDENT: [] },
  };
  const config = normalizeRolePrivileges(legacy);
  assert(!permitted({ role: 'TEACHER' }, 'attendance', config));
  assert(permitted({ role: 'TEACHER' }, 'view_attendance', config));
  assert(permitted({ role: 'STUDENT' }, 'submit_assignments', config));
});
await test('HOD bulk publishes another teacher’s departmental results but cannot grade that assignment', async () => {
  const c = await ctx('hod_cs'),
    roster = c.data.enrollments.filter((e) => e.offeringId === 'off-mobile' && e.active);
  await action(c, {
    action: 'resultBatch',
    offeringId: 'off-mobile',
    title: 'HOD department-wide exam',
    maxMarks: 100,
    published: true,
    records: roster.map((e) => ({ studentId: e.studentId, marks: 81 })),
  });
  const rows = (await all('results')).filter((r) => r.title === 'HOD department-wide exam');
  assert.equal(rows.length, roster.length);
  assert(
    payload(await ctx('student')).data.results.some(
      (r) => r.title === 'HOD department-wide exam' && r.marks === 81,
    ),
  );
  const submission = c.data.submissions.find((r) => r.assignmentId === 'a1');
  if (submission) await rejects(() => action(c, { action: 'grade', id: submission.id, marks: 5 }));
  await rejects(() =>
    save(c, 'attendance', {
      offeringId: 'off-mobile',
      studentId: 'student',
      date: '2026-01-01',
      status: 'Present',
    }),
  );
});
await test('principal cannot create, change or delete student enrollment even with academic access', async () => {
  const c = await ctx('principal'),
    enrollment = c.data.enrollments[0];
  await rejects(() => save(c, 'enrollments', { ...enrollment, active: 0 }));
  await rejects(() => remove(c, 'enrollments', enrollment.id), /Student enrollment/);
  await rejects(
    () => action(c, { action: 'assignSemesterSubjects', batchId: 'cs4', subjects: [] }),
    /Student enrollment/,
  );
});
await test('teacher appointment is validated, persisted, editable and visible in the department directory', async () => {
  const c = await ctx('hod_cs'),
    base = {
      name: 'Visiting faculty',
      username: 'visiting-faculty',
      password: 'test-teacher-password',
      role: 'TEACHER',
      departmentId: 'cs',
    };
  await rejects(() => save(c, 'users', base), /Visiting or Permanent/);
  await rejects(
    () => save(c, 'users', { ...base, employmentType: 'Temporary' }),
    /Visiting or Permanent/,
  );
  const id = await save(c, 'users', { ...base, employmentType: 'Visiting' });
  assert.equal(
    payload(await ctx('hod_cs')).data.users.find((u) => u.id === id)?.employmentType,
    'Visiting',
  );
  await save(await ctx('hod_cs'), 'users', { id, employmentType: 'Permanent' });
  assert.equal((await all('users')).find((u) => u.id === id)?.employmentType, 'Permanent');
  await remove(await ctx('hod_cs'), 'users', id);
});
await test('hierarchy follows department/session/class and keeps personal timetables separate', async () => {
  const { hierarchyBatches, offeringStudents, sessionData } = await import('../lib/lms/hierarchy');
  const c = await ctx('principal'),
    hod = c.data.users.find((u) => u.id === 'hod_cs')!;
  const batches = hierarchyBatches(c.data, hod, 'pharm');
  assert(batches.length > 0 && batches.every((b) => b.departmentId === 'cs'));
  const session = batches[0].sessionId,
    filtered = hierarchyBatches(c.data, hod, 'cs', session);
  assert(filtered.every((b) => b.sessionId === session));
  const mine = sessionData(c.data, filtered, hod.id);
  assert(mine.offerings.every((o) => o.teacherId === hod.id));
  assert(mine.timetable.every((t) => mine.offerings.some((o) => o.id === t.offeringId)));
  const department = sessionData(c.data, filtered);
  assert(department.offerings.some((o) => o.teacherId !== hod.id));
  const roster = offeringStudents(c.data, 'off-mobile');
  assert(roster.some((u) => u.id === 'student'));
  assert(!roster.some((u) => u.id === 'student4'));
  assert.equal(hierarchyBatches(c.data, c.user, 'does-not-exist').length, 0);
});
await test('repeat migrations preserve existing accounts and passwords', async () => {
  await ensureDatabase();
  await ensureDatabase();
  assert.equal(
    (await auth({ action: 'login', username: 'ahsanhanif', password: 'new-test-password' })).status,
    200,
  );
});
await test('all live roles support every implemented permission and no office role remains', async () => {
  const { roles } = await import('../lib/lms/types');
  const { defaultPrivileges, supportsPrivilege, getDefaultRolePrivileges, permitted } =
    await import('../security/privileges');
  assert(!roles.includes('STAFF'));
  for (const role of roles)
    for (const p of defaultPrivileges) assert(supportsPrivilege(role, p.key));
  assert(!defaultPrivileges.some((p) => ['tasks', 'view_tasks'].includes(p.key)));
  assert(permitted((await ctx('hod_cs')).user, 'task_assign'));
  assert(permitted((await ctx('teacher')).user, 'task_submit'));
});
await test('HOD creates Visiting and Permanent teachers only in own department', async () => {
  for (const employmentType of ['Visiting', 'Permanent']) {
    const id = await save(await ctx('hod_cs'), 'users', {
      name: employmentType + ' teacher',
      username: employmentType.toLowerCase() + '-faculty',
      password: 'faculty-test-password',
      role: 'TEACHER',
      departmentId: 'cs',
      employmentType,
    });
    assert.equal((await all('users')).find((u) => u.id === id)?.employmentType, employmentType);
    await remove(await ctx('hod_cs'), 'users', id);
  }
  await rejects(async () =>
    save(await ctx('hod_cs'), 'users', {
      name: 'Wrong department',
      username: 'wrong-department',
      password: 'faculty-test-password',
      role: 'TEACHER',
      departmentId: 'pharm',
      employmentType: 'Permanent',
    }),
  );
  await rejects(async () =>
    save(await ctx(), 'users', {
      name: 'Retired role',
      username: 'retired-role',
      password: 'faculty-test-password',
      role: 'STAFF',
      departmentId: 'cs',
    }),
  );
});
await save(await ctx(), 'users', {
  name: 'Pharmacy faculty',
  username: 'pharm-faculty',
  password: 'faculty-test-password',
  role: 'TEACHER',
  departmentId: 'pharm',
  employmentType: 'Permanent',
});
let taskId = '';
await test('HOD task deadlines, recipient and departmental scope are enforced', async () => {
  const hod = await ctx('hod_cs'),
    foreign = hod.data.users.find((v) => v.role === 'TEACHER' && v.departmentId === 'pharm')!;
  const input = {
    action: 'createFacultyTask',
    userId: 'teacher',
    title: 'Submit result to office',
    instructions: 'Bring the signed result sheet.',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  };
  await rejects(() => action(hod, { ...input, dueAt: 'invalid' }));
  await rejects(() => action(hod, { ...input, dueAt: '2000-01-01' }));
  await rejects(() => action(hod, { ...input, userId: foreign.id }));
  const result = await action(hod, input);
  taskId = result.id;
  assert(payload(await ctx('teacher')).data.facultyTasks.some((t) => t.id === taskId));
  assert(!payload(await ctx('hod_pharmd')).data.facultyTasks.some((t) => t.id === taskId));
  assert(!payload(await ctx('student')).data.facultyTasks.some((t) => t.id === taskId));
  await save(await ctx(), 'users', { id: 'hod_cs', permissions: { task_assign: false } });
  await rejects(async () => action(await ctx('hod_cs'), input));
  await save(await ctx(), 'users', { id: 'hod_cs', permissions: {} });
});
await test('pending tasks recur on new login, popup acknowledgement survives refresh, submissions stop reminders', async () => {
  await impersonate('teacher');
  let c = await context();
  assert.equal(payload(c).loginReminder, true);
  assert(payload(c).reminders.some((r) => r.id === 'task:' + taskId));
  await action(c, { action: 'ackLoginReminder' });
  assert.equal(payload(await context()).loginReminder, false);
  await impersonate('teacher');
  assert.equal(payload(await context()).loginReminder, true);
  await impersonate('lcps-administrator');
  await rejects(async () =>
    action(await ctx('hod_cs'), {
      action: 'submitFacultyTask',
      id: taskId,
      response: 'Unauthorized',
    }),
  );
  await stmt('UPDATE facultyTasks SET dueAt=? WHERE id=?', [
    '2000-01-01T00:00:00.000Z',
    taskId,
  ]).run();
  await action(await ctx('teacher'), {
    action: 'submitFacultyTask',
    id: taskId,
    response: 'Submitted to the office.',
  });
  await rejects(
    async () =>
      action(await ctx('teacher'), {
        action: 'submitFacultyTask',
        id: taskId,
        response: 'Duplicate',
      }),
    /no longer pending/,
  );
  assert(!payload(await ctx('teacher')).reminders.some((r) => r.id === 'task:' + taskId));
  assert.equal((await all('facultyTasks')).find((t) => t.id === taskId)?.status, 'Submitted');
});
await test('task attachments are private and pending cancellations end reminders', async () => {
  await impersonate('teacher');
  const form = new FormData();
  form.append('purpose', 'academic');
  form.append('file', new File(['%PDF-1.4\n%%EOF'], 'response.pdf', { type: 'application/pdf' }));
  const response = await uploadFile(
    new Request('https://portal.test/api/files', {
      method: 'POST',
      headers: { origin: 'https://portal.test' },
      body: form,
    }) as any,
  );
  assert.equal(response.status, 200);
  const file = (await response.json()) as any;
  await impersonate('lcps-administrator');
  const t = await action(await ctx('hod_cs'), {
    action: 'createFacultyTask',
    userId: 'teacher',
    title: 'Attachment task',
    instructions: 'Submit a file',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await action(await ctx('teacher'), {
    action: 'submitFacultyTask',
    id: t.id,
    response: 'Attached',
    fileId: file.id,
  });
  for (const [id, status] of [
    ['hod_cs', 200],
    ['teacher', 200],
    ['student', 403],
    ['hod_pharmd', 403],
  ] as const) {
    await impersonate(id);
    assert.equal(
      (
        await getFile(new Request('https://portal.test/api/files/' + file.id), {
          params: Promise.resolve({ id: file.id }),
        })
      ).status,
      status,
    );
  }
  await impersonate('lcps-administrator');
  const pending = await action(await ctx('hod_cs'), {
    action: 'createFacultyTask',
    userId: 'teacher',
    title: 'Cancel me',
    instructions: 'No longer needed',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await action(await ctx('hod_cs'), { action: 'cancelFacultyTask', id: pending.id });
  assert(!payload(await ctx('teacher')).reminders.some((r) => r.id === 'task:' + pending.id));
});
await test('login notices respect role audience and revoked module views', async () => {
  const id = await save(await ctx(), 'announcements', {
    title: 'Teacher only notice',
    body: 'Private teacher notice',
    departmentId: 'cs',
    targetRole: 'TEACHER',
  });
  assert(payload(await ctx('teacher')).reminders.some((r) => r.id === 'notice:' + id));
  assert(!payload(await ctx('student')).reminders.some((r) => r.id === 'notice:' + id));
  assert(!payload(await ctx('principal')).reminders.some((r) => r.id === 'notice:' + id));
  await save(await ctx(), 'users', { id: 'teacher', permissions: { view_announcements: false } });
  assert(!payload(await ctx('teacher')).reminders.some((r) => r.id === 'notice:' + id));
  await save(await ctx(), 'users', { id: 'teacher', permissions: {} });
});
await test('HOD responsibility assignment is scoped and rejects stale updates', async () => {
  const hod = await ctx('hod_cs'),
    teacher = hod.data.users.find((u) => u.id === 'teacher')!,
    foreign = hod.data.users.find((u) => u.role === 'TEACHER' && u.departmentId === 'pharm')!;
  await rejects(() =>
    action(hod, {
      action: 'setResponsibilities',
      userId: foreign.id,
      responsibilities: ['timetable_incharge'],
      expectedResponsibilities: '[]',
    }),
  );
  await rejects(() =>
    action(hod, {
      action: 'setResponsibilities',
      userId: teacher.id,
      responsibilities: ['ADMIN'],
      expectedResponsibilities: teacher.responsibilities,
    }),
  );
  await action(hod, {
    action: 'setResponsibilities',
    userId: teacher.id,
    responsibilities: ['timetable_incharge'],
    expectedResponsibilities: teacher.responsibilities,
  });
  await rejects(
    () =>
      action(hod, {
        action: 'setResponsibilities',
        userId: teacher.id,
        responsibilities: [],
        expectedResponsibilities: teacher.responsibilities,
      }),
    /changed elsewhere/,
  );
  await rejects(async () =>
    action(await ctx('teacher'), {
      action: 'setResponsibilities',
      userId: teacher.id,
      responsibilities: ['examination_controller'],
      expectedResponsibilities: '["timetable_incharge"]',
    }),
  );
});
await test('timetable incharge has department timetable access but cannot edit others coursework', async () => {
  const { permitted } = await import('../security/privileges');
  await impersonate('teacher');
  const c = await context();
  assert(permitted(c.user, 'timetable'));
  assert(payload(c).data.offerings.some((o) => o.teacherId !== c.user.id));
  const offering = c.data.offerings.find(
    (o) =>
      o.teacherId !== c.user.id &&
      c.data.batches.some((b) => b.id === o.batchId && b.departmentId === 'cs'),
  )!;
  const id = await save(c, 'timetable', {
    offeringId: offering.id,
    day: 'Sunday',
    startTime: '22:00',
    endTime: '23:00',
    room: 'Delegation test room',
  });
  await rejects(() =>
    save(c, 'assignments', {
      offeringId: offering.id,
      title: 'Not my subject',
      instructions: 'No',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      maxMarks: 10,
    }),
  );
  await impersonate('lcps-administrator');
  await remove(await ctx(), 'timetable', id);
  await save(await ctx(), 'users', { id: 'teacher', permissions: { timetable: false } });
  assert(!permitted((await ctx('teacher')).user, 'timetable'));
  await rejects(async () =>
    save(await ctx('teacher'), 'timetable', {
      offeringId: offering.id,
      day: 'Sunday',
      startTime: '22:00',
      endTime: '23:00',
      room: 'Delegation test room',
    }),
  );
  await save(await ctx(), 'users', { id: 'teacher', permissions: {} });
});
await test('examination controller manages department results only; coordinator manages departmental enrollment', async () => {
  let teacher = (await all('users')).find((u) => u.id === 'teacher')!;
  await action(await ctx('hod_cs'), {
    action: 'setResponsibilities',
    userId: teacher.id,
    responsibilities: ['examination_controller', 'program_coordinator'],
    expectedResponsibilities: teacher.responsibilities,
  });
  await impersonate('teacher');
  const c = await context(),
    o = c.data.offerings.find((o) => o.id === 'off-automata')!;
  assert(o);
  const roster = c.data.enrollments.filter((e) => e.offeringId === o.id && e.active);
  await action(c, {
    action: 'resultBatch',
    offeringId: o.id,
    title: 'Delegated exam',
    maxMarks: 100,
    published: 1,
    records: roster.map((e) => ({ studentId: e.studentId, marks: 85 })),
  });
  await rejects(() => save(c, 'quizzes', { offeringId: o.id, title: 'Not my quiz' }));
  const subjectId = await save(c, 'subjects', {
    name: 'Coordinator subject',
    code: 'COORD-TEST',
    departmentId: 'cs',
    credits: 3,
  });
  await rejects(() =>
    save(c, 'subjects', { name: 'Wrong dept', code: 'WRONG', departmentId: 'pharm', credits: 3 }),
  );
  await impersonate('lcps-administrator');
  await remove(await ctx(), 'subjects', subjectId);
  teacher = (await all('users')).find((u) => u.id === 'teacher')!;
  await action(await ctx('hod_cs'), {
    action: 'setResponsibilities',
    userId: teacher.id,
    responsibilities: [],
    expectedResponsibilities: teacher.responsibilities,
  });
  const { permitted } = await import('../security/privileges');
  assert(!permitted((await ctx('teacher')).user, 'academic'));
  assert(!permitted((await ctx('teacher')).user, 'results_department'));
});
await test('admin can grant a normally unavailable feature to a user and revoke it', async () => {
  await save(await ctx(), 'users', { id: 'teacher', permissions: { system_settings: true } });
  await action(await ctx('teacher'), { action: 'settings', college: 'LCPS Test College' });
  await save(await ctx(), 'users', { id: 'teacher', permissions: { system_settings: false } });
  await rejects(async () =>
    action(await ctx('teacher'), { action: 'settings', college: 'No access' }),
  );
  await save(await ctx(), 'users', { id: 'teacher', permissions: {} });
});
await test('migration retires legacy accounts safely and repeat execution creates no extra backups', async () => {
  const { spawnSync } = await import('node:child_process'),
    { readdirSync } = await import('node:fs'),
    { dirname } = await import('node:path');
  const legacy = {
    ...(await all('users')).find((u) => u.id === 'teacher')!,
    id: 'legacy-retirement-test',
    username: 'legacy-retirement-test',
    identifier: null,
    email: null,
    role: 'STAFF',
    active: 1,
  };
  await insert('users', legacy).run();
  await insert('loginSessions', {
    tokenHash: 'legacy-session',
    userId: legacy.id,
    expires: Date.now() + 10000,
  }).run();
  const count = (await all('users')).length;
  const migrate = () =>
    spawnSync(process.execPath, ['scripts/migrate-sqlite.mjs'], {
      encoding: 'utf8',
      env: process.env,
    });
  const first = migrate();
  assert.equal(first.status, 0, first.stderr);
  const retired = (await all('users')).find((u) => u.id === legacy.id)!;
  assert.equal(retired.role, 'RETIRED');
  assert.equal(retired.active, 0);
  assert.equal((await all('users')).length, count);
  assert(
    !(await stmt('SELECT * FROM loginSessions WHERE tokenHash=?', ['legacy-session']).first()),
  );
  const dir = dirname(process.env.TURSO_DATABASE_URL!.slice(5)),
    before = readdirSync(dir).filter((f) => f.endsWith('.bak')).length;
  const second = migrate();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.bak')).length, before);
  await stmt('DELETE FROM users WHERE id=?', [legacy.id]).run();
});
await test('backup round trip preserves task submissions and responsibility fields', async () => {
  await impersonate('lcps-administrator');
  const c = await ctx(),
    id = await createBackup(c),
    original = (await all('facultyTasks')).find((t) => t.id === taskId)!;
  await stmt('UPDATE facultyTasks SET response=? WHERE id=?', [
    'temporary changed response',
    taskId,
  ]).run();
  await restoreBackup(c, id, 'new-test-password', 'RESTORE');
  assert.equal(
    (await all('facultyTasks')).find((t) => t.id === taskId)?.response,
    original.response,
  );
  await impersonate('lcps-administrator');
  assert.equal(typeof (await context()).user.responsibilities, 'string');
});

await test('teacher qualifications persist and students see public academic profile only', async () => {
  await action(await ctx('teacher'), {
    action: 'profile',
    record: { name: 'Qualified Teacher', phone: '123', qualifications: 'MS Computer Science' },
  });
  const teacher = payload(await ctx('student')).data.users.find((t) => t.id === 'teacher');
  assert.equal(teacher?.qualifications, 'MS Computer Science');
  assert(!('phone' in teacher!));
  assert(!('permissions' in teacher!));
  await action(await ctx('student'), {
    action: 'profile',
    record: { name: 'Student', qualifications: 'Intermediate' },
  });
  await rejects(
    async () =>
      action(await ctx('teacher'), {
        action: 'profile',
        record: { name: 'Teacher', qualifications: 'x'.repeat(4001) },
      }),
    /qualifications/,
  );
});
await test('course outlines persist and enforce subject scope and independent view permission', async () => {
  const id = await save(await ctx('teacher'), 'materials', {
    offeringId: 'off-mobile',
    title: 'Mobile course outline',
    kind: 'Course outline',
    url: 'https://example.org/outline.pdf',
  });
  for (const who of ['student', 'teacher', 'hod_cs', 'principal', 'lcps-administrator'])
    assert(
      payload(await ctx(who)).data.materials.some((m) => m.id === id),
      who,
    );
  await rejects(async () =>
    save(await ctx('teacher'), 'materials', {
      offeringId: 'off-automata',
      title: 'Denied outline',
      kind: 'Course outline',
      url: 'https://example.org/outline.pdf',
    }),
  );
  await save(await ctx(), 'users', { id: 'student', permissions: { view_courseOutlines: false } });
  assert(!payload(await ctx('student')).data.materials.some((m) => m.id === id));
  await save(await ctx(), 'users', { id: 'student', permissions: {} });
  await save(await ctx(), 'users', { id: 'teacher', permissions: { view_courseOutlines: false } });
  await rejects(async () =>
    save(await ctx('teacher'), 'materials', { id, title: 'Denied change' }),
  );
  await save(await ctx(), 'users', { id: 'teacher', permissions: {} });
});
await test('material deletion is restricted to uploader and administrator', async () => {
  const teacher = await ctx('teacher');
  const ownId = await save(teacher, 'materials', {
    offeringId: 'off-mobile',
    title: 'Uploader-owned material',
    kind: 'Document',
    url: 'https://example.org/owned.pdf',
  });
  await rejects(async () => remove(await ctx('hod_cs'), 'materials', ownId), /uploader/);
  await remove(await ctx('teacher'), 'materials', ownId);
  assert(!(await all('materials')).some((material) => material.id === ownId));

  const adminOnlyId = await save(await ctx(), 'materials', {
    offeringId: 'off-mobile',
    title: 'Administrator-only material',
    kind: 'Document',
    url: 'https://example.org/admin.pdf',
  });
  await rejects(async () => remove(await ctx('teacher'), 'materials', adminOnlyId), /uploader/);
  await remove(await ctx(), 'materials', adminOnlyId);
  assert(!(await all('materials')).some((material) => material.id === adminOnlyId));
});
await test('learning resources allow at most two books per subject in each session', async () => {
  const teacher = await ctx('teacher'),
    ids: string[] = [];
  for (const title of ['Book one', 'Book two'])
    ids.push(
      await save(teacher, 'materials', {
        offeringId: 'off-mobile',
        title,
        kind: 'Document',
        resourceType: 'Book',
        url: `https://example.org/${encodeURIComponent(title)}.pdf`,
      }),
    );
  await rejects(
    () =>
      save(teacher, 'materials', {
        offeringId: 'off-mobile',
        title: 'Book three',
        kind: 'Document',
        resourceType: 'Book',
        url: 'https://example.org/book-three.pdf',
      }),
    /two books/,
  );
  for (const id of ids) await remove(await ctx('teacher'), 'materials', id);
});
await test('backup restore preserves qualifications and course outlines', async () => {
  const c = await ctx(),
    id = await createBackup(c);
  await stmt('UPDATE users SET qualifications=NULL WHERE id=?', ['teacher']).run();
  await restoreBackup(c, id, 'new-test-password', 'RESTORE');
  await impersonate('lcps-administrator');
  assert.equal(
    (await all('users')).find((u) => u.id === 'teacher')?.qualifications,
    'MS Computer Science',
  );
  assert((await all('materials')).some((m) => m.kind === 'Course outline'));
});

await test('personal diary and todo remain owner-only including administrators', async () => {
  await impersonate('lcps-administrator');
  const id = await action(await ctx('student'), {
    action: 'personalSave',
    kind: 'diary',
    title: 'Private diary',
    body: 'Only mine',
  });
  assert(payload(await ctx('student')).data.personalEntries.some((r) => r.id === id));
  assert(!payload(await ctx()).data.personalEntries.some((r) => r.id === id));
  for (const who of ['student2', 'teacher', 'hod_cs', 'lcps-administrator']) {
    await rejects(async () => action(await ctx(who), { action: 'personalDelete', id }));
    await rejects(async () =>
      action(await ctx(who), {
        action: 'personalSave',
        id,
        kind: 'diary',
        title: 'Overwrite',
        body: 'No',
      }),
    );
  }
  await impersonate('student');
  assert((await context()).data.personalEntries.every((r) => r.userId === 'student'));
  await impersonate('lcps-administrator');
  await action(await ctx('student'), {
    action: 'personalSave',
    id,
    kind: 'todo',
    title: 'Read chapter',
    body: 'Reminder',
    status: 'Done',
    dueDate: '2026-12-01',
  });
  assert.equal((await all('personalEntries')).find((r) => r.id === id)?.status, 'Done');
  await action(await ctx('student'), { action: 'personalDelete', id });
  assert(!(await all('personalEntries')).some((r) => r.id === id));
});
await test('course assessment policies enforce HOD scope, read-only teachers and valid totals', async () => {
  const policy = {
    assignment: 2,
    quiz: 3,
    attendance: 2,
    participation: 3,
    midterm: 30,
    final: 60,
    methods: 'Assignments, quizzes and exams',
  };
  for (const who of ['teacher', 'student', 'principal', 'hod_pharmd'])
    await rejects(async () =>
      action(await ctx(who), { action: 'coursePolicySave', offeringId: 'off-mobile', policy }),
    );
  await action(await ctx('hod_cs'), {
    action: 'coursePolicySave',
    offeringId: 'off-mobile',
    policy,
  });
  for (const who of ['teacher', 'student', 'hod_cs'])
    assert(payload(await ctx(who)).data.coursePolicies.some((r) => r.offeringId === 'off-mobile'));
  assert(
    !payload(await ctx('hod_pharmd')).data.coursePolicies.some(
      (r) => r.offeringId === 'off-mobile',
    ),
  );
  await rejects(
    async () =>
      action(await ctx(), {
        action: 'coursePolicySave',
        offeringId: 'off-mobile',
        policy: { ...policy, final: 55 },
      }),
    /100/,
  );
});
await test('management roles have independent bounded records and editable permissions', async () => {
  const ids: Record<string, string> = {};
  for (const role of ['TREASURER', 'EXAMINATION_CONTROLLER', 'REGISTRAR'])
    ids[role] = await save(await ctx(), 'users', {
      name: role,
      username: role.toLowerCase(),
      password: 'management-test-password',
      role,
    });
  for (const [role, kind] of [
    ['TREASURER', 'finance'],
    ['EXAMINATION_CONTROLLER', 'exams'],
    ['REGISTRAR', 'events'],
    ['REGISTRAR', 'transport'],
  ]) {
    const c = await ctx(ids[role]);
    c.user.passwordChangeRequired = 0;
    const id = await action(c, {
      action: 'managementSave',
      kind,
      title: 'Campus record',
      body: 'Test details',
      status: 'Planned',
      amount: 100,
      eventDate: '2026-12-02',
    });
    const loaded = await ctx(ids[role]);
    loaded.user.passwordChangeRequired = 0;
    assert(payload(loaded).data.managementRecords.some((r) => r.id === id));
    await rejects(async () =>
      action(await ctx('student'), {
        action: 'managementSave',
        id,
        kind,
        title: 'No',
        body: 'No',
        status: 'Planned',
      }),
    );
    await rejects(() =>
      action(
        { ...loaded, user: { ...loaded.user, permissions: JSON.stringify({ [kind]: false }) } },
        { action: 'managementDelete', id },
      ),
    );
    await action(loaded, { action: 'managementDelete', id });
  }
  const exam = await ctx(ids.EXAMINATION_CONTROLLER);
  exam.user.passwordChangeRequired = 0;
  assert(payload(exam).data.offerings.length > 0);
  assert.equal(payload(exam).data.offerings.length, exam.data.offerings.length);
  const treasurer = await ctx(ids.TREASURER);
  treasurer.user.passwordChangeRequired = 0;
  await rejects(() =>
    action(treasurer, {
      action: 'managementSave',
      kind: 'exams',
      title: 'No',
      body: 'No',
      status: 'Planned',
    }),
  );
  const notice = await save(treasurer, 'announcements', {
    title: 'Accounts office',
    body: 'Fee notice',
    targetRole: 'STUDENT',
  });
  assert(payload(await ctx('student')).data.announcements.some((a) => a.id === notice));
  assert(!payload(await ctx('teacher')).data.announcements.some((a) => a.id === notice));
  for (const id of Object.values(ids)) await remove(await ctx(), 'users', id);
});
await test('first login and reset block API access until a different password is chosen', async () => {
  const id = await save(await ctx(), 'users', {
    name: 'First login',
    username: 'first-login',
    password: 'temporary-password',
    role: 'STUDENT',
    departmentId: 'cs',
    batchId: 'cs4',
  });
  assert.equal(
    (await auth({ action: 'login', username: 'first-login', password: 'temporary-password' }))
      .status,
    200,
  );
  await rejects(() => context(), /Change your password/);
  const get = await import('../app/api/lms/route');
  const gate = await get.GET(),
    body = await gate.json();
  assert.equal(body.passwordChangeRequired, true);
  assert.equal(body.data, undefined);
  const denied = await postApi(
    new Request('https://portal.test/api/lms', {
      method: 'POST',
      headers: { origin: 'https://portal.test', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'personalSave', kind: 'diary', title: 'No' }),
    }) as any,
  );
  assert.equal(denied.status, 403);
  assert.equal(
    (
      await auth({
        action: 'change',
        currentPassword: 'temporary-password',
        newPassword: 'temporary-password',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await auth({
        action: 'change',
        currentPassword: 'temporary-password',
        newPassword: 'personal-password',
      })
    ).status,
    200,
  );
  assert.equal(
    (await auth({ action: 'login', username: 'first-login', password: 'personal-password' }))
      .status,
    200,
  );
  assert.equal((await context()).user.passwordChangeRequired, 0);
  await impersonate('lcps-administrator');
  await save(await ctx(), 'users', { id, password: 'reset-temporary-password' });
  await impersonate(id);
  await rejects(() => context(), /Change your password/);
  await impersonate('lcps-administrator');
  await remove(await ctx(), 'users', id);
});
await test('result sheet deletion respects teaching scope and leaves entered marks untouched', async () => {
  const fileId = 'delete-sheet-file';
  await env.BUCKET.put(fileId, new TextEncoder().encode('marks,test'));
  await insert('files', {
    id: fileId,
    ownerId: 'teacher',
    name: 'marks.csv',
    mime: 'text/csv',
    size: 10,
    purpose: 'result-sheet',
    createdAt: new Date().toISOString(),
  }).run();
  await stmt('DELETE FROM resultFiles WHERE offeringId=?', ['off-mobile']).run();
  await insert('resultFiles', {
    id: 'delete-sheet',
    offeringId: 'off-mobile',
    fileId,
    createdAt: new Date().toISOString(),
  }).run();
  const before = JSON.stringify(await all('results'));
  for (const who of ['student', 'hod_pharmd'])
    await rejects(async () =>
      action(await ctx(who), { action: 'deleteResultSheet', id: 'delete-sheet' }),
    );
  await action(await ctx('teacher'), { action: 'deleteResultSheet', id: 'delete-sheet' });
  assert(!(await all('resultFiles')).some((r) => r.id === 'delete-sheet'));
  assert.equal(JSON.stringify(await all('results')), before);
});
await test('new policy and personal records survive backup restore', async () => {
  const note = await action(await ctx('student'), {
    action: 'personalSave',
    kind: 'diary',
    title: 'Recovery test',
    body: 'Retained',
  });
  const c = await ctx(),
    id = await createBackup(c);
  await stmt('DELETE FROM personalEntries').run();
  await stmt('DELETE FROM coursePolicies').run();
  await restoreBackup(c, id, 'new-test-password', 'RESTORE');
  await impersonate('lcps-administrator');
  assert((await all('personalEntries')).some((r) => r.id === note));
  assert((await all('coursePolicies')).some((r) => r.offeringId === 'off-mobile'));
});

await test('attendance persists late remarks and rejects new excused marks', async () => {
  const c = await ctx('teacher'),
    roster = c.data.enrollments.filter((e) => e.offeringId === 'off-mobile' && e.active);
  assert(roster.length);
  const records = roster.map((e, i) => ({
    studentId: e.studentId,
    status: i === 0 ? 'Late' : 'Present',
    remarks: i === 0 ? 'Bus arrived late' : 'Ignore for Present',
  }));
  await action(c, {
    action: 'attendanceSubmit',
    offeringId: 'off-mobile',
    date: '2026-01-09',
    records,
    reason: 'Verified new register',
  });
  const stored = (await all('attendance')).filter(
    (a) => a.offeringId === 'off-mobile' && a.date === '2026-01-09',
  );
  assert.equal(
    stored.find((a) => a.studentId === records[0].studentId)?.remarks,
    'Bus arrived late',
  );
  assert(stored.filter((a) => a.status === 'Present').every((a) => a.remarks === null));
  const view = await action(await ctx('teacher'), {
    action: 'attendanceView',
    offeringId: 'off-mobile',
    date: '2026-01-09',
  });
  assert.equal(
    view.attendance.find((a: Row) => a.studentId === records[0].studentId)?.remarks,
    'Bus arrived late',
  );
  await rejects(
    async () =>
      action(await ctx('teacher'), {
        action: 'attendanceSubmit',
        offeringId: 'off-mobile',
        date: '2026-01-10',
        records: records.map((r) => ({ ...r, status: 'Excused' })),
      }),
    /valid attendance status/,
  );
  await rejects(
    async () =>
      action(await ctx('teacher'), {
        action: 'attendanceSubmit',
        offeringId: 'off-mobile',
        date: '2026-01-10',
        records: records.map((r) => ({ ...r, remarks: 'a'.repeat(1001) })),
      }),
    /1000/,
  );
});
await test('roll number sorting is numeric and places missing identifiers last', async () => {
  const { rollOrder } = await import('../lib/lms/ordering');
  assert.deepEqual(
    [
      { id: 'a', identifier: 'CS-10' },
      { id: 'b', identifier: 'CS-2' },
      { id: 'c', identifier: '' },
      { id: 'd', identifier: 'CS-1' },
    ]
      .sort(rollOrder)
      .map((r) => r.id),
    ['d', 'b', 'a', 'c'],
  );
  const view = await action(await ctx('teacher'), {
    action: 'attendanceView',
    offeringId: 'off-mobile',
  });
  assert.deepEqual(
    view.students.map((s: Row) => s.id),
    view.students
      .slice()
      .sort(rollOrder)
      .map((s: Row) => s.id),
  );
});
await test('legacy accounts keep existing passwords without a forced policy upgrade', async () => {
  const id = await save(await ctx(), 'users', {
    name: 'Legacy login',
    username: 'legacy-login',
    password: 'legacy-temporary-password',
    role: 'STUDENT',
    departmentId: 'cs',
    batchId: 'cs4',
  });
  await stmt('UPDATE users SET passwordChangeRequired=0,passwordPolicyVersion=0 WHERE id=?', [
    id,
  ]).run();
  await impersonate(id);
  assert.equal((await context()).user.passwordChangeRequired, 0);
  const route = await import('../app/api/lms/route');
  const response = await route.GET(),
    body = await response.json();
  assert.equal(body.passwordChangeRequired, undefined);
  assert(body.data);
  await impersonate('lcps-administrator');
  await remove(await ctx(), 'users', id);
});

await test('signout revokes the token and replay cannot restore a logged-in session', async () => {
  await impersonate('lcps-administrator');
  const old = jar.get('lcps_session')!.value;
  assert.equal((await auth({ action: 'logout' })).status, 200);
  assert.equal(jar.get('lcps_session'), undefined);
  await rejects(() => context());
  jar.set('lcps_session', old);
  await rejects(() => context());
  const route = await import('../app/api/lms/route');
  assert.equal((await route.GET()).status, 401);
  await impersonate('lcps-administrator');
});
await test('subject resources and related submissions remain isolated to the selected course', async () => {
  const { resourceScope } = await import('../lib/lms/resource-scope');
  const data = (await ctx()).data,
    scoped = resourceScope(data, 'off-mobile');
  for (const t of ['materials', 'assignments', 'quizzes'])
    assert(scoped[t].every((r) => r.offeringId === 'off-mobile'));
  assert(scoped.submissions.every((r) => scoped.assignments.some((a) => a.id === r.assignmentId)));
  assert(scoped.attempts.every((r) => scoped.quizzes.some((q) => q.id === r.quizId)));
  assert(scoped.progress.every((r) => scoped.materials.some((m) => m.id === r.materialId)));
  const empty = resourceScope(data, 'nonexistent');
  assert.equal(
    empty.materials.length +
      empty.assignments.length +
      empty.quizzes.length +
      empty.submissions.length,
    0,
  );
});
await test('attendance marking availability follows assignment, active class and explicit access controls', async () => {
  const { canRecordAttendance } = await import('../security/authorization');
  const c = await ctx('teacher');
  assert(canRecordAttendance(c.user, c.data.offerings.find((o) => o.id === 'off-mobile')!));
  assert(!canRecordAttendance(c.user, c.data.offerings.find((o) => o.id === 'off-security')!));
  assert(
    !canRecordAttendance(
      { ...c.user, permissions: JSON.stringify({ attendance: false }) },
      c.data.offerings.find((o) => o.id === 'off-mobile')!,
    ),
  );
  assert(
    !canRecordAttendance(c.user, {
      ...c.data.offerings.find((o) => o.id === 'off-mobile'),
      active: 0,
    }),
  );
  assert(
    !canRecordAttendance(
      (await ctx('student')).user,
      c.data.offerings.find((o) => o.id === 'off-mobile')!,
    ),
  );
  const h = await ctx('hod_cs');
  assert(canRecordAttendance(h.user, h.data.offerings.find((o) => o.id === 'off-security')!));
  assert(!canRecordAttendance(h.user, h.data.offerings.find((o) => o.id === 'off-mobile')!));
});
await test('HOD records own class attendance but cannot mark another teachers class', async () => {
  const h = await ctx('hod_cs'),
    records = h.data.enrollments
      .filter((e) => e.offeringId === 'off-security' && e.active)
      .map((e) => ({ studentId: e.studentId, status: 'Present' }));
  await action(h, {
    action: 'attendanceSubmit',
    offeringId: 'off-security',
    date: '2026-01-11',
    records,
  });
  await rejects(async () =>
    action(await ctx('hod_cs'), {
      action: 'attendanceSubmit',
      offeringId: 'off-mobile',
      date: '2026-01-11',
      records,
    }),
  );
  await rejects(async () =>
    action(
      {
        ...(await ctx('teacher')),
        user: {
          ...(await ctx('teacher')).user,
          permissions: JSON.stringify({ attendance: false }),
        },
      },
      { action: 'attendanceSubmit', offeringId: 'off-mobile', date: '2026-01-11', records },
    ),
  );
});
await test('co-teacher assignment authorizes attendance and stamps actual author', async () => {
  const a = await ctx();
  const o = a.data.offerings.find((x) => x.id === 'off-mobile')!;
  await save(a, 'offerings', { ...o, coTeacherId: 'iqra' });
  const c = await ctx('iqra');
  assert(payload(c).data.offerings.some((x) => x.id === o.id));
  const roster = c.data.enrollments
    .filter((e) => e.offeringId === o.id && e.active)
    .map((e) => ({ studentId: e.studentId, status: 'Present' }));
  await action(c, {
    action: 'attendanceSubmit',
    offeringId: o.id,
    date: '2026-01-20',
    records: roster,
  });
  assert(
    (await all('attendance'))
      .filter((x) => x.offeringId === o.id && x.date === '2026-01-20')
      .every((x) => x.recordedBy === 'iqra'),
  );
  await save(await ctx('iqra'), 'assignments', {
    offeringId: o.id,
    title: 'Co-teacher task',
    instructions: 'Test',
    dueDate: '2027-01-01T12:00:00Z',
    maxMarks: 10,
    allowLate: 0,
    published: 1,
  });
  assert.equal(
    (await all('assignments')).find((x) => x.title === 'Co-teacher task')?.updatedBy,
    'iqra',
  );
  await rejects(() =>
    save(c, 'assignments', {
      offeringId: 'off-automata',
      title: 'Forbidden',
      instructions: 'No',
      dueDate: '2027-01-01T12:00:00Z',
      maxMarks: 10,
    }),
  );
  const fresh = await ctx();
  await save(fresh, 'offerings', {
    ...fresh.data.offerings.find((x) => x.id === o.id),
    coTeacherId: null,
  });
});
await test('announcement deletion respects ownership and department', async () => {
  const { canDeleteAnnouncement } = await import('../security/announcement-access');
  const c = await ctx();
  const r = { id: 'test', authorId: 'teacher', departmentId: 'cs' };
  assert(canDeleteAnnouncement((await ctx('teacher')).user, r, c.data));
  assert(canDeleteAnnouncement((await ctx('hod_cs')).user, r, c.data));
  assert(!canDeleteAnnouncement((await ctx('hod_pharmd')).user, r, c.data));
  assert(canDeleteAnnouncement(c.user, r, c.data));
});
await test('break and library activities validate conflicts and delete independently', async () => {
  const c = await ctx('hod_cs');
  const r = await action(c, {
    action: 'saveScheduleEvent',
    record: {
      batchId: 'cs4',
      kind: 'Library assignment',
      title: 'Library',
      day: 'Sunday',
      startTime: '20:00',
      endTime: '21:00',
    },
  });
  const fresh = await ctx('hod_cs');
  assert(fresh.data.scheduleEvents.some((x) => x.id === r.id));
  await rejects(
    () =>
      action(fresh, {
        action: 'saveScheduleEvent',
        record: {
          batchId: 'cs4',
          kind: 'Break',
          title: 'Break',
          day: 'Sunday',
          startTime: '20:30',
          endTime: '21:15',
        },
      }),
    /conflicts/,
  );
  await rejects(
    async () =>
      action(await ctx('hod_pharmd'), { action: 'deleteScheduleEvent', record: { id: r.id } }),
    /department/,
  );
  const count = fresh.data.timetable.length;
  await action(fresh, { action: 'deleteScheduleEvent', record: { id: r.id } });
  assert.equal((await all('timetable')).length, count);
});
await test('105-student bulk import validates duplicates and enrolls every account', async () => {
  const rows = Array.from({ length: 105 }, (_, i) => ({
    name: 'Import Student ' + i,
    username: 'import-test-' + i,
    identifier: 'IMPORT-' + i,
    email: '',
    phone: '',
    password: 'Temporary-test-pass-123',
  }));
  assert(
    (await action(await ctx(), { action: 'validateStudentImport', batchId: 'cs4', rows })).valid,
  );
  await rejects(async () =>
    action(await ctx('teacher'), {
      action: 'importStudents',
      batchId: 'cs4',
      rows: rows.slice(0, 1),
    }),
  );
  for (let i = 0; i < rows.length; i += 10)
    assert(
      (
        await action(await ctx(), {
          action: 'importStudents',
          batchId: 'cs4',
          rows: rows.slice(i, i + 10),
        })
      ).valid,
    );
  const c = await ctx();
  const students = c.data.users.filter((u) => u.username.startsWith('import-test-'));
  assert.equal(students.length, 105);
  assert(students.every((u) => u.passwordChangeRequired === 1));
  const subjects = c.data.offerings.filter((o) => o.batchId === 'cs4' && o.active);
  assert(
    students.every((u) =>
      subjects.every((o) =>
        c.data.enrollments.some((e) => e.studentId === u.id && e.offeringId === o.id),
      ),
    ),
  );
  assert.equal(
    (await action(c, { action: 'validateStudentImport', batchId: 'cs4', rows: rows.slice(0, 1) }))
      .valid,
    false,
  );
});
await test('CSV account import recognizes mappings and preserves text values', async () => {
  const file = new File(
    ['Full Name,Login Username,Account Type,Department\n"Test Student",test-student,STUDENT,cs'],
    'accounts.csv',
    { type: 'text/csv' },
  );
  const parsed = await parseAccountImportFile(file);
  const mappings = guessAccountImportMappings(parsed.headers);
  assert.equal(mappings.name, 'Full Name');
  assert.equal(mappings.username, 'Login Username');
  assert.equal(mappings.role, 'Account Type');
  assert.equal(parsed.rows[0][0], 'Test Student');
});
await test('user import validates mixed roles and reports duplicate and invalid rows', async () => {
  const rows = [
    {
      _rowNumber: 2,
      name: 'Imported Teacher',
      username: 'imported-teacher',
      role: 'TEACHER',
      department: 'cs',
      employmentType: 'Permanent',
      password: 'imported-teacher-password',
    },
    {
      _rowNumber: 3,
      name: 'Duplicate Teacher',
      username: 'imported-teacher',
      role: 'TEACHER',
      department: 'cs',
      employmentType: 'Visiting',
      password: 'duplicate-teacher-password',
    },
    {
      _rowNumber: 4,
      name: 'Invalid student',
      username: 'invalid-student',
      role: 'STUDENT',
      department: 'cs',
      program: 'pharmd',
      session: '2024–2028',
      batch: 'BSCS-4A',
      password: 'invalid-student-password',
    },
  ];
  const validation = await action(await ctx(), { action: 'validateUserImport', rows });
  assert.equal(validation.valid, false);
  assert(
    validation.rows
      .find((row: Row) => row.rowNumber === 3)
      ?.errors.join(' ')
      .includes('Duplicate'),
  );
  assert(validation.rows.find((row: Row) => row.rowNumber === 4)?.errors.length);
  const imported = await action(await ctx(), { action: 'importUsers', rows });
  assert.equal(imported.created.length, 1);
  assert.equal(imported.rejected.length, 2);
  assert.equal(
    (await all('users')).find((user) => user.id === imported.created[0].id)?.employmentType,
    'Permanent',
  );
});
await test('personal profile supports safe links and social labels remain admin-only', async () => {
  await action(await ctx('student'), {
    action: 'profile',
    record: {
      name: 'Ahsan Hanif',
      bio: 'Student bio',
      qualifications: 'Intermediate',
      profileNote: 'Learning',
      profileLinks: 'https://example.com',
    },
  });
  assert.equal((await all('users')).find((u) => u.id === 'student')?.bio, 'Student bio');
  await rejects(async () =>
    action(await ctx('student'), {
      action: 'profile',
      record: { name: 'Ahsan Hanif', profileLinks: 'javascript:alert(1)' },
    }),
  );
  await rejects(async () =>
    action(await ctx('hod_cs'), { action: 'socialAccountNames', names: ['a', 'b', 'c', 'd', 'e'] }),
  );
  await action(await ctx(), {
    action: 'socialAccountNames',
    names: ['Page A', 'Page B', 'lcps.lihs.official', 'lcps780', 'LCPS channel'],
  });
});

await test('college logo upload is admin-only and public delivery follows saved branding', async () => {
  const { POST, GET } = await import('../app/api/branding/logo/route');
  const bytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0,
  ]);
  const upload = () => {
    const form = new FormData();
    form.append('file', new File([bytes], 'college.png', { type: 'image/png' }));
    return POST(
      new Request('https://portal.test/api/branding/logo', {
        method: 'POST',
        headers: { origin: 'https://portal.test' },
        body: form,
      }) as any,
    );
  };
  await impersonate('hod_cs');
  assert.equal((await upload()).status, 403);
  await impersonate('lcps-administrator');
  const result = await upload();
  assert.equal(result.status, 200, await result.text());
  const image = await GET(new Request('https://portal.test/api/branding/logo') as any);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal((await image.arrayBuffer()).byteLength, bytes.length);
});

console.log(`Final total: ${passed} integration checks passed.`);
