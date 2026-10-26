import {Data,Row} from './types';
export function hierarchyBatches(data:Data,user:Row,departmentId:string,sessionId?:string){
 const department=user.role==='HOD'?user.departmentId:departmentId;
 return data.batches.filter(b=>b.departmentId===department&&(!sessionId||b.sessionId===sessionId));
}
export function offeringStudents(data:Data,offeringId:string){
 const ids=new Set([...data.enrollments.filter(e=>e.offeringId===offeringId&&e.active).map(e=>e.studentId),...data.attendance.filter(a=>a.offeringId===offeringId).map(a=>a.studentId),...data.results.filter(r=>r.offeringId===offeringId).map(r=>r.studentId)]);
 return data.users.filter(u=>u.role==='STUDENT'&&ids.has(u.id)).sort((a,b)=>a.name.localeCompare(b.name));
}
export function sessionData(data:Data,batches:Row[],teacherId?:string):Data{
 const ids=new Set(batches.map(b=>b.id));
 const offerings=data.offerings.filter(o=>ids.has(o.batchId)&&(!teacherId||o.teacherId===teacherId));
 const offeringIds=new Set(offerings.map(o=>o.id));
 const visibleBatches=teacherId?batches.filter(b=>offerings.some(o=>o.batchId===b.id)):batches;
 return {...data,batches:visibleBatches,offerings,timetable:data.timetable.filter(t=>offeringIds.has(t.offeringId)),timetableFiles:data.timetableFiles.filter(f=>visibleBatches.some(b=>b.id===f.batchId))};
}
