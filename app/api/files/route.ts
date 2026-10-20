import {sameOrigin} from '@/security/requests';
import {rateLimit} from '@/security/rate-limit';
import {NextRequest,NextResponse} from 'next/server';
import {env} from '@/lib/platform';
import {context,AppError,insert,db,stmt} from '@/lib/lms/service';
import {uid} from '@/lib/lms/types';
import {inspectUpload,maxUploadBytes} from '@/lib/lms/file-types';
import {createHash} from 'node:crypto';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){try{
 sameOrigin(req);if(Number(req.headers.get('content-length')||0)>4400000)throw new AppError('Choose a file smaller than 4 MB.',413);
 const form=await req.formData(),file=form.get('file'),rawPurpose=form.get('purpose'),batchId=form.get('batchId'),offeringId=form.get('offeringId'),departmentId=form.get('departmentId');
 if(rawPurpose!==null&&!['avatar','academic','timetable','result-sheet','assessment-policy'].includes(String(rawPurpose)))throw new AppError('Invalid file purpose.');
 const purpose=rawPurpose==='avatar'?'avatar':rawPurpose==='timetable'?'timetable':rawPurpose==='result-sheet'?'result-sheet':rawPurpose==='assessment-policy'?'assessment-policy':'academic';
 const c=await context(false);await rateLimit('upload:'+c.user.id,30,60000);
 if(purpose==='timetable'){
  if(!['ADMIN','HOD'].includes(c.user.role))throw new AppError('Only administrators and HODs can upload timetables.',403);
  if(typeof batchId!=='string'||!batchId)throw new AppError('Select the batch, semester and session for this timetable.');
  const batch=await stmt('SELECT departmentId FROM batches WHERE id=?',[batchId]).first<{departmentId:string}>();
  if(!batch)throw new AppError('Select a valid batch.',400);
  if(c.user.role==='HOD'&&batch.departmentId!==c.user.departmentId)throw new AppError('You can only upload timetables for your department.',403);
 }
 if(purpose==='result-sheet'){
  if(!['ADMIN','HOD','TEACHER'].includes(c.user.role))throw new AppError('Only administrators, HODs and teachers can upload result sheets.',403);
  if(typeof offeringId!=='string'||!offeringId)throw new AppError('Select a subject and class for this result sheet.');
  const offering=await stmt('SELECT o.teacherId,b.departmentId FROM offerings o JOIN batches b ON b.id=o.batchId WHERE o.id=?',[offeringId]).first<{teacherId:string;departmentId:string}>();
  if(!offering)throw new AppError('Select a valid subject and class.',400);
  if(c.user.role==='HOD'&&offering.departmentId!==c.user.departmentId)throw new AppError('You can only publish results for your department.',403);
  if(c.user.role==='TEACHER'&&offering.teacherId!==c.user.id)throw new AppError('You can only publish results for your own subjects.',403);
 }
 if(purpose==='assessment-policy'){
  if(!['ADMIN','HOD'].includes(c.user.role))throw new AppError('Only administrators and HODs can upload assessment policies.',403);
  if(typeof departmentId!=='string'||!departmentId)throw new AppError('Select a department for this policy.');
  const department=await stmt('SELECT id FROM departments WHERE id=?',[departmentId]).first();
  if(!department)throw new AppError('Select a valid department.',400);
  if(c.user.role==='HOD'&&departmentId!==c.user.departmentId)throw new AppError('You can only manage your department policy.',403);
 }
 const storage=env.BUCKET,provider=env.STORAGE_MODE;if(!storage||provider==='unavailable')throw new AppError('File storage is not configured. Set FILE_STORAGE_MODE=blob and configure a private Blob store for production. FILE_STORAGE_MODE=local is only supported outside Vercel.',503);
 if(!(file instanceof File)||file.size===0||file.size>maxUploadBytes)throw new AppError('Choose a file smaller than 4 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const mime=inspectUpload(file.name,bytes,purpose==='avatar'?'avatar':purpose==='timetable'?'timetable':'academic');
 if(!mime)throw new AppError(purpose==='avatar'?'Use a valid PNG, JPG or WebP image.':purpose==='timetable'?'Use a valid PNG, JPG or PDF file.':'Use a valid PNG, JPG, WebP, PDF, Word, Excel, PowerPoint, CSV or ZIP file.');
 if(purpose==='result-sheet'&&!['text/csv','application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime))throw new AppError('Use a CSV, Excel spreadsheet or PDF result sheet.');
 const id=uid(),name=file.name.replace(/[^\w.\- ()]/g,'_').slice(0,150)||'attachment';
 const checksum=createHash('sha256').update(bytes).digest('hex');
 await storage.put(id,bytes,{httpMetadata:{contentType:mime}});
 try{
  const createdAt=new Date().toISOString();
  const writes=[insert('files',{id,ownerId:c.user.id,name,mime,size:file.size,purpose,createdAt,storageProvider:provider,storageKey:id,checksum})];
  if(purpose==='avatar')writes.push(stmt('UPDATE users SET avatar=? WHERE id=?',[id,c.user.id]));
  if(purpose==='timetable')writes.push(stmt('INSERT INTO timetableFiles (id,batchId,fileId,mime,createdAt) VALUES (?,?,?,?,?) ON CONFLICT(batchId) DO UPDATE SET fileId=excluded.fileId,mime=excluded.mime,createdAt=excluded.createdAt',[uid(),batchId,id,mime,createdAt]));
  if(purpose==='result-sheet')writes.push(stmt('INSERT INTO resultFiles (id,offeringId,fileId,createdAt) VALUES (?,?,?,?) ON CONFLICT(offeringId) DO UPDATE SET fileId=excluded.fileId,createdAt=excluded.createdAt',[uid(),offeringId,id,createdAt]));
  if(purpose==='assessment-policy')writes.push(stmt('INSERT INTO assessmentPolicies (id,departmentId,fileId,createdAt) VALUES (?,?,?,?) ON CONFLICT(departmentId) DO UPDATE SET fileId=excluded.fileId,createdAt=excluded.createdAt',[uid(),departmentId,id,createdAt]));
  await db().batch(writes);
 }catch(e){await storage.delete(id);throw e;}
 return NextResponse.json({id,name,mime,size:file.size});
 }catch(e){return NextResponse.json({error:e instanceof AppError?e.message:'File upload failed. Please try again.'},{status:e instanceof AppError?e.status:400});}}
