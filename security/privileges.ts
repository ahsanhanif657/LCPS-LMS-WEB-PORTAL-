import {Row} from '@/lib/lms/types';
export const privilegeLabels:Record<string,string>={users:'Create / edit authorized users',academic:'Manage academic structure',timetable:'Manage timetable',attendance:'Record / correct attendance',assignments:'Create / grade assignments',quizzes:'Manage quizzes',results:'Enter / publish results',materials:'Publish learning materials',announcements:'Publish announcements',tasks:'Update office tasks'};
export function privileges(u:Row):Record<string,boolean>{try{return JSON.parse(u.permissions||'{}');}catch{return {};}}
export const permitted=(u:Row,key:string)=>u.role==='ADMIN'||privileges(u)[key]!==false;
export const entityPrivilege=(t:string)=>['departments','programs','sessions','batches','subjects','offerings','enrollments','hodScopes'].includes(t)?'academic':t;
