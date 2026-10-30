import {Row} from './types';
const compare=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
export function rollOrder(a:Row,b:Row){const left=String(a.identifier||''),right=String(b.identifier||'');if(!left&&right)return 1;if(left&&!right)return -1;return compare.compare(left,right)||compare.compare(String(a.name||''),String(b.name||''))||compare.compare(String(a.id),String(b.id));}
export function sortUsers(rows:Row[],sort='id'){return rows.slice().sort(sort==='name'?(a,b)=>compare.compare(a.name||'',b.name||'')||rollOrder(a,b):sort==='id-desc'?(a,b)=>-rollOrder(a,b):rollOrder);}
