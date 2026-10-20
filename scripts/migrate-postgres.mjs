import postgres from 'postgres';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const url=process.env.DATABASE_URL||process.env.POSTGRES_URL;
function splitStatements(source){
 const statements=[];
 let current='',state='normal',dollarTag='';
 for(let i=0;i<source.length;i++){
  const char=source[i],next=source[i+1];
  if(state==='single'||state==='double'){
   current+=char;
   const delimiter=state==='single'?"'":'"';
   if(char===delimiter&&next===delimiter){current+=next;i++;}
   else if(char===delimiter)state='normal';
   continue;
  }
  if(state==='line'){current+=char;if(char==='\n')state='normal';continue;}
  if(state==='block'){current+=char;if(char==='*'&&next==='/'){current+=next;i++;state='normal';}continue;}
  if(state==='dollar'){
   if(source.startsWith(dollarTag,i)){current+=dollarTag;i+=dollarTag.length-1;state='normal';}
   else current+=char;
   continue;
  }
  if(char==="'"||char==='"'){state=char==="'"?'single':'double';current+=char;continue;}
  if(char==='-'&&next==='-'){state='line';current+=char+next;i++;continue;}
  if(char==='/'&&next==='*'){state='block';current+=char+next;i++;continue;}
  if(char==='$'){
   const tag=source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
   if(tag){state='dollar';dollarTag=tag;current+=tag;i+=tag.length-1;continue;}
  }
  if(char===';'){if(current.trim())statements.push(current.trim());current='';continue;}
  current+=char;
 }
 if(current.trim())statements.push(current.trim());
 if(state==='single'||state==='double'||state==='block'||state==='dollar')throw new Error('PostgreSQL migration contains an unterminated SQL literal or block.');
 return statements;
}

if(!url){
 console.error('Set DATABASE_URL to the PostgreSQL migration connection string.');
 process.exitCode=1;
}else{
 const sql=postgres(url,{max:1,connect_timeout:10,prepare:false,ssl:process.env.NODE_ENV==='production'?'require':undefined});
 try{
  const directory=resolve('db','postgres');
  const names=(await readdir(directory)).filter(name=>/^\d{4}_[\w-]+\.sql$/.test(name)).sort();
  if(!names.length)throw new Error('No versioned PostgreSQL migrations were found.');
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, "appliedAt" text NOT NULL)`;
  const applied=await sql`SELECT name FROM schema_migrations ORDER BY name`;
  const known=new Set(applied.map(row=>row.name));
  for(const name of names){
   if(known.has(name))continue;
   const source=await readFile(resolve(directory,name),'utf8');
   await sql.begin(async tx=>{
    for(const statement of splitStatements(source))await tx.unsafe(statement);
    await tx`INSERT INTO schema_migrations(name,"appliedAt") VALUES(${name},${new Date().toISOString()})`;
   });
   console.log(`Applied PostgreSQL migration ${name}`);
  }
  const final=(await sql`SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1`)[0]?.name;
  console.log(`PostgreSQL schema is ready at ${final}.`);
 }catch(error){
  console.error('PostgreSQL migrations failed:',error instanceof Error?error.message:'Unknown migration error.');
  process.exitCode=1;
 }finally{
  await sql.end();
 }
}
