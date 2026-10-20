import {Data,Row} from '@/lib/lms/types';
export const broad=(u:Row)=>['ADMIN','PRINCIPAL'].includes(u.role);
export const manager=(u:Row)=>['ADMIN','PRINCIPAL','HOD'].includes(u.role);
export function offeringAllowed(u:Row,o:Row,d:Data):boolean {
 if(broad(u))return true;
 const b=d.batches.find(b=>b.id===o.batchId);
 if(u.role==='HOD')return b?.departmentId===u.departmentId;
 if(u.role==='TEACHER')return o.teacherId===u.id;
 if(u.role==='STUDENT')return o.active!==0&&(b?.id===u.batchId||d.enrollments.some(e=>e.studentId===u.id&&e.offeringId===o.id&&e.active));
 return false;
}
export function teachingAllowed(u:Row,o:Row):boolean {return broad(u)||(['TEACHER','HOD'].includes(u.role)&&o.teacherId===u.id);}
export function studentManageAllowed(u:Row,st:Row,d:Data):boolean {
 if(broad(u))return st.role==='STUDENT';
 return u.role==='HOD'&&st.role==='STUDENT'&&st.departmentId===u.departmentId&&d.hodScopes.some(s=>s.userId===u.id&&s.batchId===st.batchId);
}
export function accountManageAllowed(u:Row,target:Row):boolean {
 if(u.role==='ADMIN')return true;
 return u.role==='HOD'&&['STUDENT','TEACHER'].includes(target.role)&&target.departmentId===u.departmentId;
}
export function scopedData(u:Row,d:Data):Data {
 const out:Data={};const os=d.offerings.filter(o=>offeringAllowed(u,o,d));const ids=new Set(os.map(o=>o.id));
 const enrollments=d.enrollments.filter(e=>ids.has(e.offeringId)&&(u.role!=='STUDENT'||e.studentId===u.id));
 const studentIds=new Set(enrollments.map(e=>e.studentId));
 const fullUsers=d.users.filter(v=>broad(u)||v.id===u.id||(u.role==='HOD'&&v.departmentId===u.departmentId)||(u.role==='TEACHER'&&studentIds.has(v.id)));
 out.users=d.users.filter(v=>fullUsers.some(x=>x.id===v.id)||os.some(o=>o.teacherId===v.id)).map(v=>fullUsers.some(x=>x.id===v.id)?v:{id:v.id,name:v.name,role:v.role,departmentId:v.departmentId,avatar:v.avatar,active:v.active});
 out.offerings=os;out.enrollments=enrollments;
 out.departments=d.departments.filter(x=>broad(u)||x.id===u.departmentId);
 out.programs=d.programs.filter(x=>broad(u)||x.departmentId===u.departmentId);
 out.sessions=d.sessions;
 out.batches=d.batches.filter(b=>broad(u)||(u.role==='HOD'&&b.departmentId===u.departmentId)||b.id===u.batchId||os.some(o=>o.batchId===b.id));
 out.subjects=d.subjects.filter(s=>broad(u)||(u.role==='HOD'&&s.departmentId===u.departmentId)||os.some(o=>o.subjectId===s.id));
 out.hodScopes=d.hodScopes.filter(x=>u.role==='ADMIN'||x.userId===u.id);
 out.resultFiles=d.resultFiles.filter(r=>ids.has(r.offeringId));
 out.assessmentPolicies=d.assessmentPolicies.filter(r=>broad(u)||r.departmentId===u.departmentId);
 out.timetableFiles=d.timetableFiles.filter(r=>broad(u)||(u.role==='HOD'&&d.batches.some(b=>b.id===r.batchId&&b.departmentId===u.departmentId))||(u.role==='TEACHER'&&os.some(o=>o.batchId===r.batchId))||(u.role==='STUDENT'&&r.batchId===u.batchId));
 for(const table of ['timetable','attendance','assignments','quizzes','results','materials']) out[table]=d[table].filter(r=>ids.has(r.offeringId)&&(u.role!=='STUDENT'||((!r.studentId||r.studentId===u.id)&&(!['assignments','quizzes','results'].includes(table)||r.published))));
 out.submissions=d.submissions.filter(s=>out.assignments.some(a=>a.id===s.assignmentId)&&(u.role!=='STUDENT'||s.studentId===u.id));
 out.attempts=d.attempts.filter(a=>out.quizzes.some(q=>q.id===a.quizId)&&(u.role!=='STUDENT'||a.studentId===u.id)).map(a=>u.role==='STUDENT'&&!out.quizzes.find(q=>q.id===a.quizId)?.release?{...a,score:null}:a);
 out.quizzes=out.quizzes.map(q=>({...q,questions:JSON.parse(q.questions).map((v:Row)=>{if(u.role==='STUDENT'){const {correct,...rest}=v;return rest;}return v;})}));
 out.progress=d.progress.filter(p=>out.materials.some(m=>m.id===p.materialId)&&(u.role!=='STUDENT'||p.studentId===u.id));
 out.announcements=d.announcements.filter(a=>broad(u)||a.authorId===u.id||((!a.departmentId||a.departmentId===u.departmentId)&&(!a.batchId||a.batchId===u.batchId||os.some(o=>o.batchId===a.batchId))&&(!a.offeringId||ids.has(a.offeringId))&&(!a.targetRole||a.targetRole===u.role)));
 out.tasks=d.tasks.filter(t=>u.role==='ADMIN'||t.userId===u.id);
 out.audit=u.role==='ADMIN'?d.audit.slice(-150).reverse():[];
 return out;
}
export function overlap(a:Row,b:Row,offerings:Row[]):boolean {
 if(a.id===b.id||a.day!==b.day||a.startTime>=b.endTime||a.endTime<=b.startTime)return false;
 const ao=offerings.find(o=>o.id===a.offeringId),bo=offerings.find(o=>o.id===b.offeringId);
 return a.room.trim().toLowerCase()===b.room.trim().toLowerCase()||!!(ao&&bo&&(ao.teacherId===bo.teacherId||ao.batchId===bo.batchId));
}
export function attendancePercent(records:Row[]):number|null {const counted=records.filter(r=>r.status!=='Excused');return counted.length?Math.round(counted.filter(r=>['Present','Late'].includes(r.status)).length/counted.length*100):null;}
