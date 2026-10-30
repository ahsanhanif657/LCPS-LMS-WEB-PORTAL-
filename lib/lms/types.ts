export type Row = Record<string, any>;
export type Data = Record<string, Row[]>;
export const roles = ['STUDENT','TEACHER','HOD','PRINCIPAL','ADMIN','TREASURER','EXAMINATION_CONTROLLER','REGISTRAR'];
export const tables = ['departments','programs','sessions','batches','users','subjects','offerings','enrollments','hodScopes','scheduleEvents','timetable','timetableFiles','resultFiles','assessmentPolicies','attendance','assignments','submissions','quizzes','attempts','results','announcements','materials','progress','tasks','facultyTasks','personalEntries','coursePolicies','managementRecords','audit'];
export const today = () => new Date().toISOString().slice(0,10);
export const uid = () => crypto.randomUUID();
