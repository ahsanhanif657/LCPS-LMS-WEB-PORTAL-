import {Context,AppError,stmt,db,insert,auditStmt} from './service';
import {Row,uid} from './types';
import {permitted} from '@/security/privileges';
import {offeringAllowed,resultsAllowed} from '@/security/authorization';
function check(ok:unknown,message='You do not have permission to perform this action.',status=403):asserts ok{if(!ok)throw new AppError(message,status);}
function text(v:unknown,label:string,max=10000){check(typeof v==='string'&&v.trim().length>0&&v.length<=max,`Enter a valid ${label} (maximum ${max} characters).`,400);return v.trim();}
function date(v:unknown){if(!v)return null;check(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Enter a valid date.',400);return v;}
export async function extensionAction(c:Context,b:Row){
 const u=c.user,now=new Date().toISOString();check(!u.passwordChangeRequired,'Change your password before using the portal.');
 if(b.action==='personalSave'||b.action==='personalDelete'){
  const old=b.id?await stmt('SELECT * FROM personalEntries WHERE id=? AND userId=?',[b.id,u.id]).first<Row>():null;
  if(b.id)check(old,'Personal entry not found.',404);
  if(b.action==='personalDelete'){check(old,'Personal entry not found.',404);await stmt('DELETE FROM personalEntries WHERE id=? AND userId=?',[old.id,u.id]).run();return;}
  check(['diary','todo'].includes(b.kind),'Select diary or to-do.',400);check(['Pending','Done'].includes(b.status||'Pending'),'Invalid status.',400);
  const r={id:old?.id||uid(),userId:u.id,kind:b.kind,title:text(b.title,'title',200),body:typeof b.body==='string'?b.body:'',dueDate:date(b.dueDate),status:b.status||'Pending',createdAt:old?.createdAt||now,updatedAt:now};check(r.body.length<=20000,'Notes are too long.',400);
  if(old)await stmt('UPDATE personalEntries SET kind=?,title=?,body=?,dueDate=?,status=?,updatedAt=? WHERE id=? AND userId=?',[r.kind,r.title,r.body,r.dueDate,r.status,now,r.id,u.id]).run();else await insert('personalEntries',r).run();return r.id;
 }
 if(b.action==='coursePolicySave'){
  const o=c.data.offerings.find(o=>o.id===b.offeringId);check(['ADMIN','HOD'].includes(u.role)&&o&&offeringAllowed(u,o,c.data)&&(u.role==='ADMIN'||c.data.batches.some(batch=>batch.id===o.batchId&&batch.departmentId===u.departmentId))&&permitted(u,'view_courseOutlines'));
  const p=b.policy;check(p&&typeof p==='object','Enter assessment weights.',400);const clean:Row={};
  for(const k of ['assignment','quiz','attendance','participation','midterm','final']){check(typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0&&p[k]<=100,'Weights must be numbers between 0 and 100.',400);clean[k]=p[k];}
  check(Math.abs(Object.values(clean).reduce((a:number,v)=>a+Number(v),0)-100)<0.0001,'Assessment weights must total 100%.',400);clean.methods=text(p.methods,'assessment methods',2000);
  await db().batch([stmt('INSERT INTO coursePolicies(id,offeringId,policy,updatedBy,updatedAt) VALUES(?,?,?,?,?) ON CONFLICT(offeringId) DO UPDATE SET policy=excluded.policy,updatedBy=excluded.updatedBy,updatedAt=excluded.updatedAt',[uid(),o!.id,JSON.stringify(clean),u.id,now]),auditStmt(u,'update','coursePolicies',o!.id)]);return;
 }
 if(b.action==='deleteResultSheet'){
  check(permitted(u,'results'));const r=c.data.resultFiles.find(r=>r.id===b.id),o=c.data.offerings.find(o=>o.id===r?.offeringId);check(r&&o&&resultsAllowed(u,o,c.data),'Result sheet not found or outside your scope.');
  // Unlink the sheet; preserve its object for recovery and leave entered marks untouched.
  await db().batch([stmt('DELETE FROM resultFiles WHERE id=?',[r.id]),auditStmt(u,'delete','resultFiles',r.id,'Removed sheet; entered marks retained.')]);return;
 }
 const old=b.id?await stmt('SELECT * FROM managementRecords WHERE id=?',[b.id]).first<Row>():null;if(b.id)check(old,'Management record not found.',404);
 const kind=old?.kind||b.kind;check(['finance','exams','events','transport'].includes(kind)&&permitted(u,kind));
 if(b.action==='managementDelete'){check(old,'Record not found.',404);await db().batch([stmt('DELETE FROM managementRecords WHERE id=?',[old.id]),auditStmt(u,'delete','managementRecords',old.id)]);return;}
 check(['Planned','In progress','Completed','Cancelled'].includes(b.status),'Select a valid status.',400);
 const amount=kind==='finance'&&b.amount!==''&&b.amount!=null?Number(b.amount):null;check(amount===null||(Number.isFinite(amount)&&amount>=0),'Enter a non-negative amount.',400);
 const r:Row={id:old?.id||uid(),kind,title:text(b.title,'title',200),body:text(b.body,'details'),status:b.status,amount,eventDate:date(b.eventDate),createdBy:old?.createdBy||u.id,createdAt:old?.createdAt||now,updatedAt:now};
 const keys=Object.keys(r).filter(k=>k!=='id');await db().batch([old?stmt('UPDATE managementRecords SET '+keys.map(k=>'"'+k+'"=?').join(',')+' WHERE id=?',[...keys.map(k=>r[k]),r.id]):insert('managementRecords',r),auditStmt(u,old?'update':'create','managementRecords',r.id)]);return r.id;
}
