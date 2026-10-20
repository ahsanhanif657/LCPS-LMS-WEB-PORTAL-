import {Data,Row} from './types';
export type GradingPolicy={name:string;assessments:{title:string;weight:number}[];bands:{min:number;grade:string;points:number}[];maxPoints:number;attendanceMinimum:number};
export function validateGrading(p:GradingPolicy){
 if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>120)throw new Error('Enter a policy name.');
 if(!Array.isArray(p.assessments)||p.assessments.length<1||p.assessments.length>12)throw new Error('Add 1–12 assessments.');
 const titles=new Set<string>();let sum=0;
 for(const a of p.assessments){if(typeof a.title!=='string'||!a.title.trim()||a.title.length>80||titles.has(a.title.trim().toLowerCase())||!Number.isFinite(a.weight)||a.weight<=0||a.weight>100)throw new Error('Use unique assessment titles and positive weights.');titles.add(a.title.trim().toLowerCase());sum+=a.weight;}
 if(Math.abs(sum-100)>0.001)throw new Error('Assessment weights must total 100%.');
 if(!Number.isFinite(p.maxPoints)||p.maxPoints<=0||p.maxPoints>10)throw new Error('Maximum grade points must be greater than 0 and at most 10.');
 if(!Number.isFinite(p.attendanceMinimum)||p.attendanceMinimum<0||p.attendanceMinimum>100)throw new Error('Attendance minimum must be 0–100%.');
 if(!Array.isArray(p.bands)||!p.bands.length||p.bands.length>20)throw new Error('Add 1–20 grade bands.');
 const mins=new Set<number>(),labels=new Set<string>();
 for(const b of p.bands){if(typeof b.grade!=='string'||!b.grade.trim()||b.grade.length>12||labels.has(b.grade)||!Number.isFinite(b.min)||b.min<0||b.min>100||mins.has(b.min)||!Number.isFinite(b.points)||b.points<0||b.points>p.maxPoints)throw new Error('Check grade labels, thresholds and points.');mins.add(b.min);labels.add(b.grade);}
 if(!mins.has(0))throw new Error('Include a grade band starting at 0%.');
 const bands=[...p.bands].sort((a,b)=>a.min-b.min);if(bands.some((b,i)=>i>0&&b.points<bands[i-1].points))throw new Error('Grade points must not decrease as marks increase.');
 return {...p,name:p.name.trim(),assessments:p.assessments.map(a=>({...a,title:a.title.trim()})),bands:bands.reverse()};
}
export function courseGrade(policy:GradingPolicy|null,results:Row[]){
 if(!policy)return {complete:false,percentage:null,grade:null,points:null,missing:[] as string[]};
 const missing=policy.assessments.filter(a=>results.filter(r=>r.published&&r.title.toLowerCase()===a.title.toLowerCase()).length!==1).map(a=>a.title);
 if(missing.length)return {complete:false,percentage:null,grade:null,points:null,missing};
 const percentage=policy.assessments.reduce((sum,a)=>{const r=results.find(r=>r.published&&r.title.toLowerCase()===a.title.toLowerCase())!;return sum+r.marks/r.maxMarks*a.weight;},0);
 const band=[...policy.bands].sort((a,b)=>b.min-a.min).find(b=>percentage>=b.min)!;
 return {complete:true,percentage,grade:band.grade,points:band.points,missing};
}
export function transcript(studentId:string,d:Data,policy:GradingPolicy|null){
 const enrolled=d.enrollments.filter(e=>e.studentId===studentId&&e.active),offerings=d.offerings.filter(o=>enrolled.some(e=>e.offeringId===o.id));
 const courses=offerings.map(o=>{const subject=d.subjects.find(s=>s.id===o.subjectId);return {offeringId:o.id,batchId:o.batchId,subject:subject?.name||'',credits:subject?.credits||0,...courseGrade(policy,d.results.filter(r=>r.studentId===studentId&&r.offeringId===o.id))};});
 const groups=[...new Set(courses.map(c=>c.batchId))].map(batchId=>{const rows=courses.filter(c=>c.batchId===batchId),complete=!!policy&&rows.length>0&&rows.every(c=>c.complete),credits=rows.reduce((s,c)=>s+c.credits,0);return {batchId,courses:rows,complete,gpa:complete&&credits?rows.reduce((s,c)=>s+c.points!*c.credits,0)/credits:null};});
 return groups;
}
