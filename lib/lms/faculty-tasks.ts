import {Context,AppError,stmt,db,insert,auditStmt} from './service';
import {Row,uid} from './types';
import {permitted,responsibilityTemplates} from '@/security/privileges';
import {broad} from '@/security/authorization';
function check(value:unknown,message='Access denied.',status=403):asserts value {if(!value)throw new AppError(message,status);}
export async function facultyAction(c:Context,body:Row){
 const u=c.user,allowed=(key:string)=>permitted(u,key,c.rolePrivileges);
 const sameDepartment=(departmentId:string)=>broad(u)||!!u.departmentId&&departmentId===u.departmentId;
 if(body.action==='ackLoginReminder'){
  await stmt('UPDATE loginSessions SET remindersSeen=1 WHERE tokenHash=? AND userId=?',[c.sessionHash,u.id]).run();return;
 }
 if(body.action==='setResponsibilities'){
  check(allowed('delegate_responsibilities'));
  const teacher=c.data.users.find(v=>v.id===body.userId);
  check(teacher?.active&&teacher.role==='TEACHER'&&sameDepartment(teacher.departmentId),'Choose an active teacher in your department.');
  check(Array.isArray(body.responsibilities)&&body.responsibilities.length<=3&&new Set(body.responsibilities).size===body.responsibilities.length&&body.responsibilities.every((k:unknown)=>typeof k==='string'&&Object.hasOwn(responsibilityTemplates,k)),'Choose valid responsibilities.',400);
  // Delegation cannot exceed the assigner's own academic powers.
  for(const k of body.responsibilities){const main= k==='timetable_incharge'?'timetable':k==='program_coordinator'?'academic':'results';check(allowed(main),'You cannot delegate a responsibility whose access is disabled for you.');}
  check(typeof body.expectedResponsibilities==='string','Refresh the teacher before saving.',409);
  const result=await stmt("UPDATE users SET responsibilities=? WHERE id=? AND responsibilities=? RETURNING id",[JSON.stringify(body.responsibilities),teacher.id,body.expectedResponsibilities]).first();
  check(result,'Responsibilities changed elsewhere. Refresh and try again.',409);
  await auditStmt(u,'delegate','responsibilities',teacher.id,JSON.stringify(body.responsibilities)).run();return;
 }
 check(allowed('view_teacherTasks'),'Task viewing is disabled.');
 if(body.action==='createFacultyTask'){
  check(allowed('task_assign'));
  const teacher=c.data.users.find(v=>v.id===body.userId);
  check(teacher?.active&&teacher.role==='TEACHER'&&sameDepartment(teacher.departmentId),'Choose an active teacher in your department.');
  check(typeof body.title==='string'&&body.title.trim().length>0&&body.title.length<=160,'Enter a task title (maximum 160 characters).',400);
  check(typeof body.instructions==='string'&&body.instructions.trim().length>0&&body.instructions.length<=10000,'Enter task instructions (maximum 10,000 characters).',400);
  check(typeof body.dueAt==='string'&&Number.isFinite(Date.parse(body.dueAt))&&Date.parse(body.dueAt)>Date.now(),'Choose a future submission date and time.',400);
  const id=uid();await db().batch([insert('facultyTasks',{id,userId:teacher.id,departmentId:teacher.departmentId,assignedBy:u.id,title:body.title.trim(),instructions:body.instructions.trim(),dueAt:new Date(body.dueAt).toISOString(),createdAt:new Date().toISOString(),status:'Pending'}),auditStmt(u,'assign','facultyTasks',id)]);return {id};
 }
 const task=await stmt('SELECT * FROM facultyTasks WHERE id=?',[body.id]).first<Row>();
 check(task,'Task not found.',404);
 if(body.action==='submitFacultyTask'){
  check(allowed('task_submit')&&task.userId===u.id,'Only the assigned teacher can submit this task.');
  check(typeof body.response==='string'&&body.response.trim().length>0&&body.response.length<=20000,'Enter your submission or completion details.',400);
  if(body.fileId){const file=await stmt('SELECT ownerId,purpose FROM files WHERE id=?',[body.fileId]).first<Row>();check(file?.ownerId===u.id&&file?.purpose==='academic','Invalid attachment.',400);}
  const result=await stmt("UPDATE facultyTasks SET status='Submitted',response=?,fileId=?,submittedAt=? WHERE id=? AND userId=? AND status='Pending' RETURNING id",[body.response.trim(),body.fileId||null,new Date().toISOString(),task.id,u.id]).first();
  check(result,'This task is no longer pending. Refresh your tasks.',409);
  await auditStmt(u,'submit','facultyTasks',task.id).run();return;
 }
 if(body.action==='cancelFacultyTask'){
  check(allowed('task_assign')&&sameDepartment(task.departmentId)&&(u.role==='ADMIN'||task.assignedBy===u.id));
  const result=await stmt("UPDATE facultyTasks SET status='Cancelled' WHERE id=? AND status='Pending' RETURNING id",[task.id]).first();check(result,'Only pending tasks can be cancelled.',409);
  await auditStmt(u,'cancel','facultyTasks',task.id).run();return;
 }
 throw new AppError('Unknown task action.',400);
}
