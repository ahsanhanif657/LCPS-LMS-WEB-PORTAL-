import {departmentAccess,permitted} from '@/security/privileges';
import {Row,tables} from './types';
import {stmt} from './service';
// Restrict high-volume academic records in SQL before loading them into memory.
export function dataQueries(user:Row){
 const dept=departmentAccess(user);
 const broad=['ADMIN','PRINCIPAL'].includes(user.role)||permitted(user,'exams');
 const offeringSql=dept?'SELECT o.id FROM offerings o JOIN batches b ON b.id=o.batchId WHERE b.departmentId=?':user.role==='TEACHER'?'SELECT id FROM offerings WHERE (teacherId=? OR coTeacherId=?)':user.role==='HOD'?'SELECT o.id FROM offerings o JOIN batches b ON b.id=o.batchId WHERE b.departmentId=?':user.role==='STUDENT'?'SELECT id FROM offerings WHERE batchId=? AND active=1 UNION SELECT offeringId FROM enrollments WHERE studentId=? AND active=1':'SELECT id FROM offerings WHERE 0';
 const values=dept?[user.departmentId]:user.role==='TEACHER'?[user.id,user.id]:user.role==='HOD'?[user.departmentId]:user.role==='STUDENT'?[user.batchId,user.id]:[];
 return tables.map(table=>{
  if(table==='offerings')return stmt('SELECT o.*,(SELECT count(*) FROM enrollments e WHERE e.offeringId=o.id AND e.active=1) AS enrollmentCount FROM offerings o');
  if(table==='personalEntries')return stmt('SELECT * FROM personalEntries WHERE userId=?',[user.id]);
  if(table==='managementRecords')return stmt('SELECT * FROM managementRecords WHERE kind IN (?,?,?,?)',['finance','exams','events','transport'].map(k=>permitted(user,k)?k:''));
  if(table==='coursePolicies')return stmt('SELECT * FROM coursePolicies');
  if(table==='materials'&&['TREASURER','REGISTRAR'].includes(user.role))return stmt("SELECT * FROM materials WHERE kind='Course outline'");
  if(table==='audit')return stmt(user.role==='ADMIN'?'SELECT * FROM (SELECT * FROM audit ORDER BY createdAt DESC LIMIT 150) ORDER BY createdAt':'SELECT * FROM audit WHERE 0');
  if(broad)return stmt(`SELECT * FROM "${table}"`);
  if(table==='facultyTasks')return stmt('SELECT * FROM facultyTasks WHERE userId=? OR (departmentId=? AND ?=1)',[user.id,user.departmentId,permitted(user,'task_assign')?1:0]);
  if(table==='timetableFiles'){
   if(dept)return stmt('SELECT * FROM timetableFiles WHERE batchId IN (SELECT id FROM batches WHERE departmentId=?)',[user.departmentId]);
   if(user.role==='STUDENT')return stmt('SELECT * FROM timetableFiles WHERE batchId=?',[user.batchId]);
   if(user.role==='TEACHER')return stmt('SELECT * FROM timetableFiles WHERE batchId IN (SELECT batchId FROM offerings WHERE (teacherId=? OR coTeacherId=?))',[user.id,user.id]);
   if(user.role==='HOD')return stmt('SELECT * FROM timetableFiles WHERE batchId IN (SELECT id FROM batches WHERE departmentId=?)',[user.departmentId]);
   return stmt('SELECT * FROM timetableFiles WHERE 0');
  }
  if(table==='resultFiles')return stmt(`SELECT * FROM resultFiles WHERE offeringId IN (${offeringSql})`,values);
  if(table==='assessmentPolicies'){
   if(['STUDENT','TEACHER','HOD'].includes(user.role))return stmt('SELECT * FROM assessmentPolicies WHERE departmentId=?',[user.departmentId]);
   return stmt('SELECT * FROM assessmentPolicies WHERE 0');
  }
  if(['timetable','attendance','assignments','quizzes','results','materials','enrollments'].includes(table)){
   let sql=`SELECT * FROM "${table}" WHERE offeringId IN (${offeringSql})`,params=[...values];
   if(user.role==='STUDENT'){
    if(['attendance','results','enrollments'].includes(table)){sql+=' AND studentId=?';params.push(user.id);}
    if(['assignments','quizzes','results'].includes(table))sql+=' AND published=1';
   }
   return stmt(sql,params);
  }
  const relation=table==='submissions'?['assignmentId','assignments']:table==='attempts'?['quizId','quizzes']:table==='progress'?['materialId','materials']:null;
  if(relation){let sql=`SELECT * FROM "${table}" WHERE "${relation[0]}" IN (SELECT id FROM "${relation[1]}" WHERE offeringId IN (${offeringSql}))`,params=[...values];if(user.role==='STUDENT'){sql+=' AND studentId=?';params.push(user.id);}return stmt(sql,params);}
  return stmt(`SELECT * FROM "${table}"`);
 });
}
