'use client';
import {useState} from 'react';
import {Data} from '@/lib/lms/types';
import {BookOpen} from 'lucide-react';
export function ResourceSubjects({data,title,onSelect}:{data:Data;title:string;onSelect:(id:string)=>void}){return <section><h1>{title}</h1><p>Select a subject to open its records. Resources stay grouped under the selected subject.</p><div className="subjects-grid full-grid">{data.offerings.map(o=><button className="subject-card" key={o.id} onClick={()=>onSelect(o.id)}><div className="subject-art mint"><BookOpen size={44}/></div><div className="subject-body"><small>{data.subjects.find(s=>s.id===o.subjectId)?.code}</small><h3>{data.subjects.find(s=>s.id===o.subjectId)?.name}</h3><p>{data.batches.find(b=>b.id===o.batchId)?.name}</p></div></button>)}</div>{!data.offerings.length&&<p className="panel">No enrolled subjects available.</p>}</section>;}

export function AdminResourceSubjects({data,title,onSelect}:{data:Data;title:string;onSelect:(id:string)=>void}){
 const [session,setSession]=useState(''),[department,setDepartment]=useState('');
 const filtered={...data,offerings:data.offerings.filter(o=>data.batches.some(b=>b.id===o.batchId&&b.sessionId===session&&(!department||b.departmentId===department)))};
 return <><h1>{title}</h1><div className="panel directory-filters form-grid"><label className="field"><span>Department</span><select value={department} onChange={e=>{setDepartment(e.target.value);setSession('');}}><option value="">All departments</option>{data.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="field"><span>Academic session</span><select value={session} onChange={e=>setSession(e.target.value)}><option value="">Select session</option>{data.sessions.filter(s=>data.batches.some(b=>b.sessionId===s.id&&(!department||b.departmentId===department))).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>{session?<ResourceSubjects data={filtered} title="Select subject" onSelect={onSelect}/>:<p className="panel directory-empty">Select a session to browse subjects.</p>}</>;
}
