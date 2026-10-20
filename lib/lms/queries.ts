import {Row,tables} from './types';
import {stmt} from './service';
// Restrict high-volume academic records in SQL before loading them into memory.
export function dataQueries(user:Row){
 const broad=['ADMIN','PRINCIPAL'].includes(user.role);
 const offeringSql=user.role==='TEACHER'?'SELECT id FROM offerings WHERE teacherId=?':user.role==='HOD'?'SELECT o.id FROM offerings o JOIN batches b ON b.id=o.batchId WHERE b.departmentId=?':user.role==='STUDENT'?'SELECT id FROM offerings WHERE batchId=? AND active=1 UNION SELECT offeringId FROM enrollments WHERE studentId=? AND active=1':'SELECT id FROM offerings WHERE 0';
 const values=user.role==='TEACHER'?[user.id]:user.role==='HOD'?[user.departmentId]:user.role==='STUDENT'?[user.batchId,user.id]:[];
 return tables.map(table=>{
  if(table==='audit')return stmt(user.role==='ADMIN'?'SELECT * FROM (SELECT * FROM audit ORDER BY createdAt DESC LIMIT 150) ORDER BY createdAt':'SELECT * FROM audit WHERE 0');
  if(broad)return stmt(`SELECT * FROM "${table}"`);
  if(table==='timetableFiles'){
   if(user.role==='STUDENT')return stmt('SELECT * FROM timetableFiles WHERE batchId=?',[user.batchId]);
   if(user.role==='TEACHER')return stmt('SELECT * FROM timetableFiles WHERE batchId IN (SELECT batchId FROM offerings WHERE teacherId=?)',[user.id]);
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
