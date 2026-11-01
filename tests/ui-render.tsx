import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AttendanceSummary,
  TeacherProfile,
  CourseOutlines,
  SessionSubjects,
} from '../app/academic-components';
import { TimetableSchedule } from '../app/academic-hierarchy';
import { ResultsWorkflow } from '../app/portal-workflows';
import { LoginForm } from '../app/security';
import { Badge, Empty, Modal, PageTitle, Section } from '../app/portal-ui';
import { LoginNotices } from '../app/faculty-tasks';
import { seedData } from '../lib/lms/seed';
import { scopedData } from '../security/authorization';
const data = seedData(),
  student = data.users.find((u) => u.id === 'student')!,
  hod = data.users.find((u) => u.id === 'hod_cs')!;
const markup = renderToStaticMarkup(
  <AttendanceSummary
    records={[
      { status: 'Present' },
      { status: 'Absent' },
      { status: 'Late' },
      { status: 'Excused' },
    ]}
  />,
);
assert(markup.includes('67%'));
assert(markup.includes('Counted classes'));
assert(markup.includes('Present · Absent'));
const profile = renderToStaticMarkup(
  <TeacherProfile
    teacher={{
      name: 'Teacher',
      qualifications: 'MS <CS>',
      phone: 'PRIVATE-PHONE',
      avatar: 'avatar-id',
    }}
  />,
);
assert(profile.includes('MS &lt;CS&gt;'));
assert(!profile.includes('PRIVATE-PHONE'));
assert(profile.includes('/api/files/avatar-id'));
const scoped = scopedData(student, data),
  outlines = renderToStaticMarkup(<CourseOutlines data={scoped} user={student} />);
assert(outlines.includes('Select subject'));
assert(!outlines.includes('Add course outline'));
const sessions = renderToStaticMarkup(
  <SessionSubjects data={data} renderSubject={() => 'SHOULD-NOT-RENDER'} />,
);
assert(!sessions.includes('SHOULD-NOT-RENDER'));
const result = renderToStaticMarkup(
  <ResultsWorkflow data={data} user={hod} label={(_, id) => id} run={async () => {}} />,
);
assert(result.includes('1. Academic session'));
assert(!result.includes('Marks for '));
const schedule = renderToStaticMarkup(<TimetableSchedule data={scoped} user={student} />);
assert(schedule.includes('<table class="weekly-schedule">'));
assert(schedule.includes('weekly-class'));
assert(
  schedule.includes(
    scoped.users.find((u) => u.id === scoped.offerings[0]?.teacherId)?.name || 'Teacher',
  ),
);
assert(!schedule.includes('timetable-card'));
const login = renderToStaticMarkup(<LoginForm error="" onLogin={async () => {}} />);
assert(login.includes('auth-card'));
assert(login.includes('/api/branding/logo'));
assert(login.includes('Welcome back'));
const portalUi = renderToStaticMarkup(
  <>
    <Badge tone="green">Active</Badge>
    <Empty title="No records" text="Add a record to begin." />
    <Section title="Attendance" subtitle="Recent records" link="View all" onClick={() => {}} />
    <PageTitle title="Dashboard" text="Portal overview" />
    <Modal title="Confirm" onClose={() => {}}>
      <p>Dialog content</p>
    </Modal>
  </>,
);
assert(portalUi.includes('class="badge green"'));
assert(portalUi.includes('class="empty"'));
assert(portalUi.includes('class="section-head"'));
assert(portalUi.includes('class="page-title"'));
assert(portalUi.includes('role="dialog"'));
const notices = renderToStaticMarkup(
  <LoginNotices
    visible
    items={[
      { id: 'n', title: 'Faculty notice', detail: 'Review your marks', page: 'announcements' },
    ]}
    acknowledge={async () => {}}
    navigate={() => {}}
  />,
);
assert(notices.includes('notice-list'));
assert(notices.includes('Announcement'));
assert(notices.includes('role="dialog"'));
console.log(
  'PASS 8 component rendering checks: attendance, profile privacy, outlines, session gates, results gate, timetable, login and notices',
);

const { CoursePolicy, CommunityBanner, RecordWorkspace } = await import('../app/portal-additions');
const policyView = renderToStaticMarkup(
  <CoursePolicy data={scoped} user={student} offeringId="off-mobile" run={async () => {}} />,
);
assert(policyView.includes('30%'));
assert(policyView.includes('60%'));
assert(policyView.includes('Participation / Presentation'));
assert(!policyView.includes('Edit assessment policy'));
const hodPolicy = renderToStaticMarkup(
  <CoursePolicy data={data} user={hod} offeringId="off-mobile" run={async () => {}} />,
);
assert(hodPolicy.includes('Edit assessment policy'));
const banner = renderToStaticMarkup(<CommunityBanner data={scoped} />);
for (const domain of ['facebook.com', 'instagram.com', 'tiktok.com', 'whatsapp.com'])
  assert(banner.includes(domain));
assert(banner.includes('Management announcements'));
assert(banner.includes('social-brand'));
assert(banner.includes('social-username'));
assert(banner.includes('social-platform'));
assert.equal((banner.match(/target="_blank"/g) || []).length, 5);
const personal = renderToStaticMarkup(
  <RecordWorkspace data={scoped} user={student} run={async () => {}} personal />,
);
assert(personal.includes('Personal diary'));
assert(personal.includes('To-do list'));
console.log(
  'PASS policy permissions, reference weights, social links and personal workspace rendering',
);
const { UserDirectory, UserPhoto } = await import('../app/user-directory');
const directory = renderToStaticMarkup(
  <UserDirectory data={data} user={hod} rows={data.users} render={() => 'PRIVATE-ROWS'} />,
);
assert(directory.includes('Academic session'));
assert(directory.includes('Sort users'));
assert(!directory.includes('PRIVATE-ROWS'));
const { TimetableManager } = await import('../app/timetable-manager');
const incharge = {
  ...data.users.find((u) => u.id === 'teacher')!,
  responsibilities: '["timetable_incharge"]',
};
const timetableManager = renderToStaticMarkup(
  <TimetableManager
    data={data}
    user={incharge}
    refresh={async () => {}}
    onEdit={() => {}}
    onDelete={() => {}}
  />,
);
assert(timetableManager.includes('Academic session'));
assert(timetableManager.includes('Choose a session and class'));
assert(!timetableManager.includes('Edit class'));
const { ResourceSubjects } = await import('../app/resource-subjects');
const resourcePicker = renderToStaticMarkup(
  <ResourceSubjects data={scoped} title="Assignments" onSelect={() => {}} />,
);
assert(resourcePicker.includes('Select a subject'));
assert(!resourcePicker.includes('Submit assignment'));
assert(outlines.includes('Assessment policy reference'));
assert(outlines.includes('60%'));
assert(login.includes('Remember me'));
assert(login.includes('aria-label="Show password"'));
assert(
  renderToStaticMarkup(<UserPhoto user={{ name: 'Test User', avatar: 'photo-test' }} />).includes(
    '/api/files/photo-test',
  ),
);
console.log(
  'PASS session/subject gates, incharge timetable gate, policy visibility and profile images',
);

const { FacultyAttendance } = await import('../app/attendance-workspace');
const { AttendanceWorkflow } = await import('../app/portal');
const teacher = data.users.find((u) => u.id === 'teacher')!;
for (const user of [teacher, hod]) {
  const ownData = scopedData(user, data);
  const html = renderToStaticMarkup(
    <FacultyAttendance
      data={ownData}
      user={user}
      loadView={async () => ({ offerings: [] })}
      renderMark={(id) => <span>MARK-CLASS:{id}</span>}
    />,
  );
  assert(html.includes('Mark attendance'));
  assert(html.includes('MARK-CLASS:'));
  assert(!html.includes('MARK-CLASS:off-automata'));
}
const denied = { ...teacher, permissions: JSON.stringify({ attendance: false }) };
const disabled = renderToStaticMarkup(
  <FacultyAttendance
    data={scopedData(denied, data)}
    user={denied}
    loadView={async () => ({ offerings: [] })}
    renderMark={() => 'MUST-NOT-MARK'}
  />,
);
assert(disabled.includes('Attendance marking is disabled'));
assert(!disabled.includes('MUST-NOT-MARK'));
const register = renderToStaticMarkup(
  <AttendanceWorkflow
    data={scopedData(teacher, data)}
    user={teacher}
    label={(_, id) => id}
    run={async () => {}}
    fixedOfferingId="off-mobile"
  />,
);
const header = register.match(/<thead>(.*?)<\/thead>/s)![1];
assert.equal((header.match(/<th>/g) || []).length, 6);
assert.equal((header.match(/S.No./g) || []).length, 1);
assert(register.includes('Remarks (Late)'));
console.log(
  'PASS direct faculty marking, HOD own-class entry, explicit denied-access message, six-column attendance register',
);

const { clientRowId } = await import('../lib/lms/client-id');
const originalRandomUUID = globalThis.crypto.randomUUID;
try {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
  const first = clientRowId(),
    second = clientRowId();
  assert.match(first, /^[a-f0-9]{32}$/);
  assert.notEqual(first, second);
} finally {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: originalRandomUUID,
    configurable: true,
  });
}
console.log('PASS HTTP LAN form-row IDs work without randomUUID');
