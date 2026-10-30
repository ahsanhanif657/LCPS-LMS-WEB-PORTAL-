import {Data,Row} from '@/lib/lms/types';
export function canDeleteAnnouncement(u:Row,a:Row,d:Data){if(u.role==='ADMIN'||a.authorId===u.id)return true;if(u.role!=='HOD'||!u.departmentId)return false;const o=d.offerings.find(o=>o.id===a.offeringId),b=d.batches.find(b=>b.id===(a.batchId||o?.batchId));return a.departmentId===u.departmentId||b?.departmentId===u.departmentId;}
