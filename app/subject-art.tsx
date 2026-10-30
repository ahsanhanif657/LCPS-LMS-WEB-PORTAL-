import {BookOpen,Layers,GraduationCap} from 'lucide-react';
export function SubjectArt({code,index=0}:{code?:string;index?:number}){const Icon=[BookOpen,Layers,GraduationCap][index%3];return <div className={'subject-art course-blue-'+index%3}><span className="subject-code">{code}</span><Icon size={48} strokeWidth={1.5}/><span className="art-circle"/></div>;}
