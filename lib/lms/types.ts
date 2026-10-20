export type Row = Record<string, any>;
export type Data = Record<string, Row[]>;
export const roles = ['STUDENT','TEACHER','STAFF','HOD','PRINCIPAL','ADMIN'];
export const tables = ['departments','programs','sessions','batches','users','subjects','offerings','enrollments','hodScopes','timetable','timetableFiles','resultFiles','assessmentPolicies','attendance','assignments','submissions','quizzes','attempts','results','announcements','materials','progress','tasks','audit'];
export const today = () => new Date().toISOString().slice(0,10);
export const uid = () => crypto.randomUUID();
