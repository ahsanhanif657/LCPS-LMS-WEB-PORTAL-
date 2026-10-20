'use client';
import {useEffect,useState} from 'react';
import {Download,Upload} from 'lucide-react';
import {Data,Row} from '@/lib/lms/types';
import {timetableAccept} from '@/lib/lms/file-types';

export function TimetableFiles({data,user,onUploaded}:{data:Data;user:Row;onUploaded:()=>Promise<void>}){
 const allowed=['ADMIN','HOD'].includes(user.role);
 const batches=data.batches||[];
 const [batchId,setBatchId]=useState(()=>batches.find(b=>b.active!==0)?.id||'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!batches.some(b=>b.id===batchId))setBatchId(batches.find(b=>b.active!==0)?.id||'');},[batches,batchId]);
 async function upload(file:File){
  setBusy(true);setError('');
  try{
   const body=new FormData();body.append('file',file);body.append('purpose','timetable');body.append('batchId',batchId);
   const response=await fetch('/api/files',{method:'POST',body}),result=await response.json();
   if(!response.ok)throw new Error(result.error||'Timetable upload failed.');
   await onUploaded();
  }catch(e){setError(e instanceof Error?e.message:'Timetable upload failed.');}
  finally{setBusy(false);}
 }
 const batchLabel=(batch:Row)=>`${batch.name} · Semester ${batch.semester} · ${data.sessions.find(s=>s.id===batch.sessionId)?.name||'Session'}`;
 return <section className="timetable-files">
  {allowed&&<div className="panel timetable-upload">
   <div><h2>Import a timetable</h2><p>Upload a PNG, JPG or PDF timetable for a specific batch, semester and session.</p></div>
   <label className="field"><span>Batch · semester · session</span><select value={batchId} required onChange={e=>setBatchId(e.target.value)}><option value="">Select a batch</option>{batches.map(b=><option key={b.id} value={b.id}>{batchLabel(b)}</option>)}</select></label>
   <label className="btn upload-label"><Upload size={16}/>{busy?'Uploading…':'Choose timetable file'}<input type="file" accept={timetableAccept} disabled={busy||!batchId} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></label>
   {error&&<p className="form-error" role="alert">{error}</p>}
  </div>}
  {(data.timetableFiles||[]).map(file=>{
   const batch=batches.find(b=>b.id===file.batchId);
   const image=String(file.mime).startsWith('image/');
   return <article className="panel timetable-file" key={file.id}>
    <div className="row between"><div><h2>{batch?batchLabel(batch):'Timetable'}</h2><p>{image?'Image timetable':'PDF timetable'}</p></div><a className="btn" href={`/api/files/${file.fileId}`}><Download size={16}/>Download timetable</a></div>
    {image?<img src={`/api/files/${file.fileId}?view=1`} alt={`${batch?batchLabel(batch):'Class'} timetable`}/>:<iframe src={`/api/files/${file.fileId}?view=1`} title={`${batch?batchLabel(batch):'Class'} timetable`} loading="lazy"/>}
   </article>;
  })}
 </section>;
}
