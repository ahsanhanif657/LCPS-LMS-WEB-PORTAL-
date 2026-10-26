import {Data,Row} from './types';
export type Reminder={id:string;title:string;detail:string;page:string;dueAt?:string};
// Input is already server-scoped by audience, department, subject and permissions.
export function loginReminders(user:Row,data:Data):Reminder[]{
 const out:Reminder[]=[];
 for(const t of data.facultyTasks||[])if(t.userId===user.id&&t.status==='Pending')out.push({id:'task:'+t.id,title:t.title,detail:t.instructions,page:'teacherTasks',dueAt:t.dueAt});
 for(const a of data.announcements||[])out.push({id:'notice:'+a.id,title:a.title,detail:a.body,page:'announcements'});
 for(const a of data.assignments||[])if(a.published&&Date.parse(a.dueDate)>=Date.now()&&!data.submissions.some(s=>s.assignmentId===a.id&&s.studentId===user.id))out.push({id:'assignment:'+a.id,title:a.title,detail:'Assignment available',page:'assignments',dueAt:a.dueDate});
 for(const q of data.quizzes||[])if(q.published&&Date.parse(q.closesAt)>=Date.now())out.push({id:'quiz:'+q.id,title:q.title,detail:q.topic||'Quiz topic / preparation material',page:'quizzes'});
 for(const m of data.materials||[])out.push({id:'material:'+m.id,title:m.title,detail:m.kind==='Course outline'?'Course outline available':'Learning material available',page:m.kind==='Course outline'?'courseOutlines':'materials'});
 const results=new Set<string>();for(const r of data.results||[])if(r.published&&!results.has(r.offeringId+'|'+r.title)){results.add(r.offeringId+'|'+r.title);out.push({id:'result:'+r.id,title:r.title,detail:'Published result available',page:'results'});}
 return out;
}
