import {createClient} from '@libsql/client';
import postgres from 'postgres';

const dryRun=process.argv.includes('--dry-run');
const apply=process.argv.includes('--apply');
const snapshotConfirmed=process.argv.includes('--confirm-source-snapshot');
const tables=[
 'departments','sessions','programs','batches','users','settings','subjects','offerings','enrollments',
 'hodScopes','timetable','attendance','assignments','submissions','quizzes','attempts','results',
 'announcements','materials','progress','tasks','audit','credentials','loginLimits','loginSessions',
 'previews','files','timetableFiles','resultFiles','assessmentPolicies','blobMetadata','privateFileObjects'
];
const primaryKeys={
 departments:'id',sessions:'id',programs:'id',batches:'id',users:'id',settings:'key',subjects:'id',
 offerings:'id',enrollments:'id',hodScopes:'id',timetable:'id',attendance:'id',assignments:'id',
 submissions:'id',quizzes:'id',attempts:'id',results:'id',announcements:'id',materials:'id',
 progress:'id',tasks:'id',audit:'id',credentials:'userId',loginLimits:'key',loginSessions:'tokenHash',
 previews:'authId',files:'id',timetableFiles:'id',resultFiles:'id',assessmentPolicies:'id',blobMetadata:'key',privateFileObjects:'key'
};
const order=tables;
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const fail=message=>{throw new Error(message);};
const sourceUrl=process.env.SOURCE_DATABASE_URL;
const targetUrl=process.env.DATABASE_URL||process.env.POSTGRES_URL;

if(dryRun===apply)fail('Choose exactly one mode: --dry-run or --apply.');
if(!sourceUrl)fail('Set SOURCE_DATABASE_URL to the existing Turso URL or SQLite file URL.');
if(!targetUrl)fail('Set DATABASE_URL to the already-migrated PostgreSQL database.');
if(apply&&!snapshotConfirmed)fail('Create and verify a source database snapshot, then rerun with --confirm-source-snapshot.');

const source=createClient({url:sourceUrl,authToken:process.env.SOURCE_DATABASE_AUTH_TOKEN});
const target=postgres(targetUrl,{max:4,connect_timeout:10,prepare:false,ssl:process.env.NODE_ENV==='production'?'require':undefined});

async function sourceTableExists(table){
 const result=await source.execute({sql:"SELECT name FROM sqlite_master WHERE type='table' AND name=?",args:[table]});
 return result.rows.length>0;
}
async function getSourceColumns(table){
 const result=await source.execute(`PRAGMA table_info(${quote(table)})`);
 return result.rows.map(row=>String(row.name));
}
async function sourceCount(table){
 const result=await source.execute(`SELECT COUNT(*) AS count FROM ${quote(table)}`);
 return Number(result.rows[0].count);
}
async function targetCount(table){
 const result=await target.unsafe(`SELECT COUNT(*)::bigint AS count FROM ${quote(table)}`);
 return Number(result[0].count);
}
function normalize(value){
 if(value instanceof Uint8Array)return Buffer.from(value).toString('base64');
 if(typeof value==='bigint')return value.toString();
 return value;
}
function sameRow(left,right,columns){
 return columns.every(column=>JSON.stringify(normalize(left[column]??null))===JSON.stringify(normalize(right[column]??null)));
}
async function targetRowsByKey(table,key,keys,columns){
 if(!keys.length)return [];
 const placeholders=keys.map((_,i)=>'$'+(i+1)).join(',');
 return target.unsafe(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)} WHERE ${quote(key)} IN (${placeholders})`,keys);
}

try{
 const targetMigration=await target`SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1`;
 if(targetMigration[0]?.name!=='0004_department_academics.sql')fail('Target database has not completed the PostgreSQL schema migrations.');
 const layout=[];
 for(const table of tables){
  if(!await sourceTableExists(table)){
   if(table==='blobMetadata'||table==='privateFileObjects')continue;
   fail(`Source table ${table} is missing. No data was written.`);
  }
  const sourceColumns=await getSourceColumns(table);
  const targetDescription=await target.unsafe(
   'SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position',
   [table]
  );
  const targetColumns=targetDescription.map(row=>String(row.column_name));
  if(!targetColumns.length)fail(`Target table ${table} is missing. Run PostgreSQL migrations first.`);
  const columns=sourceColumns.filter(column=>targetColumns.includes(column));
  if(table==='files')for(const column of ['storageProvider','storageKey','checksum'])if(targetColumns.includes(column)&&!columns.includes(column))columns.push(column);
  if(table==='quizzes'&&targetColumns.includes('fileId')&&!columns.includes('fileId'))columns.push('fileId');
  if(!columns.includes(primaryKeys[table]))fail(`Table ${table} does not have its expected primary key.`);
  const sourceRows=await sourceCount(table),existingRows=await targetCount(table);
  if(table==='loginSessions'&&existingRows!==0)fail('Target contains login sessions; clear them before importing so every user must sign in again.');
  if(existingRows>sourceRows)fail(`Target table ${table} contains more records than the source; refusing to merge.`);
  layout.push({table,sourceColumns,columns,sourceRows,existingRows,key:primaryKeys[table]});
 }
 console.log(`Preflight passed for ${layout.length} source tables.`);
 for(const item of layout)console.log(`${item.table}: source=${item.sourceRows}, resumable target=${item.existingRows}`);
 if(dryRun){
  console.log('Dry run only; no records were copied or changed.');
 }else{
  for(const item of layout){
   const {table,columns,key}=item;
   if(table==='loginSessions'){
    console.log(`Skipped ${item.sourceRows} source login sessions; users must sign in again after cutover.`);
    continue;
   }
   const insertSql=`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT DO NOTHING`;
   const pageSize=100;
   for(let offset=0;offset<item.sourceRows;offset+=pageSize){
    const page=await source.execute({sql:`SELECT * FROM ${quote(table)} LIMIT ? OFFSET ?`,args:[pageSize,offset]});
    const rows=page.rows.map(row=>({...row}));
    if(table==='files')for(const row of rows){
     if(!item.sourceColumns.includes('storageProvider'))row.storageProvider='legacy';
     if(!item.sourceColumns.includes('storageKey'))row.storageKey=row.id;
     if(!item.sourceColumns.includes('checksum'))row.checksum=null;
    }
    if(table==='quizzes'&&!item.sourceColumns.includes('fileId'))for(const row of rows)row.fileId=null;
    await target.begin(async transaction=>{
     for(const row of rows){
      const values=columns.map(column=>{
        const value=column==='storageProvider'&&!item.sourceColumns.includes(column)?'legacy':
         column==='storageKey'&&!item.sourceColumns.includes(column)?row.id:
         column==='checksum'&&!item.sourceColumns.includes(column)?null:
         column==='fileId'&&!item.sourceColumns.includes(column)?null:
         row[column]??null;
        return value instanceof Uint8Array?Buffer.from(value):value;
       });
      await transaction.unsafe(insertSql,values);
     }
    });
    const keys=rows.map(row=>row[key]);
    const copied=await targetRowsByKey(table,key,keys,columns);
    const indexed=new Map(copied.map(row=>[String(row[key]),row]));
    for(const sourceRow of rows){
     const targetRow=indexed.get(String(sourceRow[key]));
     if(!targetRow||!sameRow(sourceRow,targetRow,columns))fail(`Record verification failed in ${table}; the source was retained and the import can be resumed after resolving the conflict.`);
    }
   }
   if(table==='loginSessions')continue;
   const finalCount=await targetCount(table);
   if(finalCount!==item.sourceRows)fail(`Count verification failed for ${table}; expected ${item.sourceRows}, found ${finalCount}. Source data was not deleted.`);
   console.log(`Verified ${table}: ${finalCount} records.`);
  }
  console.log('Import and row-count verification completed. The Turso/SQLite source remains unchanged.');
  console.log('Source login sessions were not copied; all users must sign in again after cutover.');
 }
}catch(error){
 console.error('Turso-to-PostgreSQL migration stopped:',error instanceof Error?error.message:'Unknown error.');
 process.exitCode=1;
}finally{
 source.close();
 await target.end();
}
