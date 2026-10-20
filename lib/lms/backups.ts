import {env} from '@/lib/platform';
import {getTableColumns} from 'drizzle-orm';
import * as schema from '@/db/schema';
import {tables,Row} from './types';
import {Context,AppError,db,stmt,auditStmt,insert} from './service';
import {digest,verifyPassword} from './password';
const snapshotTables=[...tables.filter(t=>!['timetableFiles','resultFiles','assessmentPolicies'].includes(t)),'files','timetableFiles','resultFiles','assessmentPolicies','credentials','settings'];
const prefix='private-backups/managed/';
const columns=(table:string)=>Object.values(getTableColumns((schema as any)[table])).map((v:any)=>v.name as string);
const checkAdmin=(c:Context)=>{if(c.user.role!=='ADMIN')throw new AppError('Administrator access required.',403);if(!env.BUCKET)throw new AppError('Backup storage is unavailable.',503);};
export async function listBackups(c:Context){checkAdmin(c);const listed=await env.BUCKET!.list({prefix,limit:100,include:['customMetadata']});return listed.objects.map(o=>({id:o.key.slice(prefix.length),createdAt:o.customMetadata?.createdAt,reason:o.customMetadata?.reason,size:o.size})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
export async function createBackup(c:Context,reason='Manual backup'){
 checkAdmin(c);
 const results=await db().batch(snapshotTables.map(t=>stmt(`SELECT * FROM "${t}"`)));
 const data:Record<string,Row[]>={};snapshotTables.forEach((t,i)=>data[t]=results[i].results as Row[]);
 for(const t of snapshotTables)if(new TextEncoder().encode(JSON.stringify(data[t])).length>1500000)throw new AppError('This dataset exceeds the in-app recovery limit. Use provider database backups for this size.',413);
 const createdAt=new Date().toISOString(),id=createdAt.replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json';
 const body=JSON.stringify({version:1,createdAt,data});
 if(new TextEncoder().encode(body).length>12000000)throw new AppError('This dataset requires provider backup tooling.',413);
 await env.BUCKET!.put(prefix+id,body,{httpMetadata:{contentType:'application/json'},customMetadata:{createdAt,reason,checksum:await digest(body)}});
 await auditStmt(c.user,'create','backup',id,reason).run();return id;
}
export async function restoreBackup(c:Context,id:string,password:string,confirmation:string){
 checkAdmin(c);
 if(confirmation!=='RESTORE')throw new AppError('Type RESTORE to confirm replacement of the current records.');
 if(typeof id!=='string'||!/^[\w-]+\.json$/.test(id))throw new AppError('Choose a valid backup.');
 const limitKey='restore:'+c.user.id;
 await stmt('INSERT INTO loginLimits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END',[limitKey,Date.now()+900000,Date.now(),Date.now()]).run();
 const limit=await stmt('SELECT count FROM loginLimits WHERE key=?',[limitKey]).first<Row>();if(limit!.count>5)throw new AppError('Too many restore attempts. Try again in 15 minutes.',429);
 const cred=await stmt('SELECT hash FROM credentials WHERE userId=?',[c.user.id]).first<Row>();
 if(!cred||!await verifyPassword(password,cred.hash))throw new AppError('Current administrator password is incorrect.',403);
 const object=await env.BUCKET!.get(prefix+id);if(!object)throw new AppError('Backup not found.',404);
 if(object.size>12000000)throw new AppError('Backup exceeds the recovery limit.',413);
 const body=await object.text();if(object.customMetadata?.checksum!==await digest(body))throw new AppError('Backup integrity check failed.');
 let parsed;try{parsed=JSON.parse(body);}catch{throw new AppError('Backup is not valid JSON.');}
 if(parsed.version!==1||!parsed.data)throw new AppError('Unsupported backup format.');
 const data=parsed.data as Record<string,Row[]>;
 if(!Array.isArray(data.timetableFiles))data.timetableFiles=[];
 // Older v1 snapshots predate quiz attachments.
 if(Array.isArray(data.quizzes))for(const quiz of data.quizzes)if(!('fileId' in quiz))quiz.fileId=null;
 // Older snapshots do not identify the storage provider for each file.
 if(Array.isArray(data.files))for(const file of data.files){file.storageProvider||='legacy';file.storageKey||=file.id;file.checksum??=null;}
 for(const t of snapshotTables){const keys=columns(t);if(!Array.isArray(data[t])||new TextEncoder().encode(JSON.stringify(data[t])).length>1500000||data[t].some(r=>!r||Object.keys(r).length!==keys.length||Object.keys(r).some(k=>!keys.includes(k))))throw new AppError('Backup schema does not match this portal.');}
 if(!data.users.some(u=>u.id===c.user.id&&u.active&&u.role==='ADMIN'&&!u.demo))throw new AppError('This backup does not preserve your active administrator account.');
 if(data.users.some(u=>u.demo))throw new AppError('Demo datasets cannot be restored through the college portal.');
 if(!data.credentials.some(r=>r.userId===c.user.id))throw new AppError('Administrator credentials are missing in this backup.');
 const owner=await stmt("SELECT value FROM settings WHERE key='owner'").first<Row>();
 if(!data.settings.some(r=>r.key==='owner'&&r.value===owner?.value)||!data.settings.some(r=>r.key==='college_auth_v2'))throw new AppError('Backup identity does not match this portal.');
 // Uploaded objects are immutable and retained. Reject a snapshot if its file objects are missing.
 for(const file of data.files){const storage=env.fileStorage(file.storageProvider||'legacy'),key=file.storageKey||file.id;if(!storage||!await storage.head(key))throw new AppError('An uploaded file referenced by this backup is missing: '+file.name);}
 const safetyId=await createBackup(c,'Automatic snapshot before restore');
 const writes=[stmt('DELETE FROM loginSessions'),stmt('DELETE FROM previews'),stmt('DELETE FROM credentials')];
 for(const t of tables.slice().reverse()){if(t==='users')writes.push(stmt('DELETE FROM files'));writes.push(stmt(`DELETE FROM "${t}"`));}writes.push(stmt('DELETE FROM settings'));
 for(const t of snapshotTables)for(const row of data[t])writes.push(insert(t,row));
 // Keep the operator's current password, even if it changed since the selected backup.
 writes.push(stmt('UPDATE credentials SET hash=? WHERE userId=?',[cred.hash,c.user.id]),stmt('DELETE FROM loginLimits WHERE key=?',[limitKey]),auditStmt(c.user,'restore','backup',id,'Safety snapshot: '+safetyId));
 await db().batch(writes);return {safetyId};
}
