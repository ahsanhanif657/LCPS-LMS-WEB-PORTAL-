'use client';
import {ReactNode,useState} from 'react';
import {CheckCheck,ClipboardList} from 'lucide-react';
import {Data,Row} from '@/lib/lms/types';
import {canRecordAttendance} from '@/security/authorization';
import {permitted} from '@/security/privileges';
import {AttendanceBrowser} from './portal-workflows';
import {AcademicHierarchy} from './academic-hierarchy';

export function FacultyAttendance({data,user,initialOfferingId='',loadView,renderMark}:{data:Data;user:Row;initialOfferingId?:string;loadView:(request:Row)=>Promise<any>;renderMark:(id:string)=>ReactNode}){
 const options=data.offerings.filter(o=>canRecordAttendance(user,o));
 const [tab,setTab]=useState(options.length?'mark':'records');
 const [selected,setSelected]=useState(initialOfferingId);
 const offering=options.find(o=>o.id===selected)||options[0];
 const canMark=permitted(user,'attendance');
 const openMark=(id:string)=>{if(!options.some(o=>o.id===id))return;setSelected(id);setTab('mark');};
 return <>
 <div className="tabs attendance-tabs" role="tablist" aria-label="Attendance workspace">
 {canMark&&<button role="tab" aria-selected={tab==='mark'} className={tab==='mark'?'active':''} onClick={()=>setTab('mark')}><CheckCheck size={18}/>Mark attendance</button>}
 <button role="tab" aria-selected={tab==='records'||!canMark} className={tab==='records'||!canMark?'active':''} onClick={()=>setTab('records')}><ClipboardList size={18}/>{user.role==='HOD'?'Department records':'View attendance records'}</button>
 </div>
 {!canMark&&<p className="notice" role="status">Attendance marking is disabled for this account. Ask the administrator to enable “Record / correct attendance” in your access settings.</p>}
 {tab==='mark'&&canMark?<>{offering?<><div className="panel attendance-course-picker"><label className="field"><span>Subject and class</span><select value={offering.id} onChange={e=>setSelected(e.target.value)}>{options.map(o=><option key={o.id} value={o.id}>{data.subjects.find(s=>s.id===o.subjectId)?.name} · {data.batches.find(b=>b.id===o.batchId)?.name}</option>)}</select></label><p>Only your assigned active classes are available for marking.</p></div>{renderMark(offering.id)}</>:<p className="panel directory-empty">No active teaching classes are assigned to you. Ask your academic administrator to check Teaching assignments.</p>}</>:user.role==='HOD'?<AcademicHierarchy data={data} user={user} mode="attendance"/>:<AttendanceBrowser user={user} loadView={loadView} canMark={id=>options.some(o=>o.id===id)} onMarkAttendance={openMark}/>}
 </>;
}
