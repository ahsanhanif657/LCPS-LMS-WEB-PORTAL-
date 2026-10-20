export function translatePostgresQuery(sql:string,values:unknown[]){
 let query='',index=0,state:'normal'|'single'|'double'|'line'|'block'='normal';
 for(let i=0;i<sql.length;i++){
  const char=sql[i],next=sql[i+1];
  if(state==='single'){
   query+=char;
   if(char==="'"&&next==="'"){query+=next;i++;}
   else if(char==="'")state='normal';
   continue;
  }
  if(state==='double'){
   query+=char;
   if(char==='"'&&next==='"'){query+=next;i++;}
   else if(char==='"')state='normal';
   continue;
  }
  if(state==='line'){query+=char;if(char==='\n')state='normal';continue;}
  if(state==='block'){query+=char;if(char==='*'&&next==='/'){query+=next;i++;state='normal';}continue;}
  if(char==="'"){state='single';query+=char;continue;}
  if(char==='"'){state='double';query+=char;continue;}
  if(char==='-'&&next==='-'){state='line';query+=char+next;i++;continue;}
  if(char==='/'&&next==='*'){state='block';query+=char+next;i++;continue;}
  if(char==='?'){query+='$'+(++index);continue;}
  if(/[A-Za-z_]/.test(char)){
   let end=i+1;
   while(end<sql.length&&/[A-Za-z0-9_$]/.test(sql[end]))end++;
   const token=sql.slice(i,end);
   query+=/[a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*/.test(token)?'"'+token+'"':token;
   i=end-1;
   continue;
  }
  query+=char;
 }
 if(index!==values.length)throw new Error(`SQL parameter mismatch: query has ${index} placeholders but received ${values.length} values.`);
 return query;
}
