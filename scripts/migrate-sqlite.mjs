import nextEnv from '@next/env';
import {createClient} from '@libsql/client';
import {migrations,supplementalMigrations} from '../db/migrations.ts';
import {resolve} from 'node:path';

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.TURSO_DATABASE_URL;
if(!url){
 console.error('Set TURSO_DATABASE_URL to the existing SQLite file or Turso database.');
 process.exitCode=1;
}else{
 const client=createClient({url,...(process.env.TURSO_AUTH_TOKEN?{authToken:process.env.TURSO_AUTH_TOKEN}:{})});
 const query=async(sql,args=[])=>client.execute({sql,args});
 const hasObject=async(type,name)=>{
  const result=await query('SELECT 1 FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);
  return result.rows.length>0;
 };
 const hasColumn=async(table,column)=>{
  const result=await query(`PRAGMA table_info("${table.replaceAll('"','""')}")`);
  return result.rows.some(row=>row.name===column);
 };
 try{
  const pending=[];
  for(const migration of [...migrations,...supplementalMigrations])for(const statement of migration.statements){
   const create=statement.match(/^\s*CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z0-9_]+)[`"]?/i);
   if(create){if(create[1].toLowerCase()==='index'&&create[2]==='subjects_code_unique')continue;if(!await hasObject(create[1].toLowerCase(),create[2]))pending.push(statement);continue;}
   const drop=statement.match(/^\s*DROP\s+INDEX\s+IF\s+EXISTS\s+[`"]?([A-Za-z0-9_]+)[`"]?/i);
   if(drop){if(await hasObject('index',drop[1]))pending.push(statement);continue;}
   const alter=statement.match(/^\s*ALTER\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+ADD\s+(?:COLUMN\s+)?[`"]?([A-Za-z0-9_]+)[`"]?/i);
   if(alter){if(!await hasColumn(alter[1],alter[2]))pending.push(statement);continue;}
   pending.push(statement);
  }
  const extraColumns=[
   ['files','storageProvider',"text NOT NULL DEFAULT 'legacy'"],
   ['files','storageKey','text'],
   ['files','checksum','text'],
   ['quizzes','fileId','text']
  ];
  const missingColumns=[];
  for(const [table,column,definition] of extraColumns)if(!await hasColumn(table,column))missingColumns.push([table,column,definition]);
  const hasUsers=await hasObject('table','users');
  const userCount=hasUsers?Number((await query('SELECT COUNT(*) AS count FROM users')).rows[0].count):0;
  const needsUpdate=pending.length>0||missingColumns.length>0||
   !await hasObject('table','privateFileObjects')||!await hasObject('table','blobMetadata');
  if(needsUpdate&&userCount&&url.startsWith('file:')){
   const rawPath=decodeURIComponent(url.slice(5).split('?')[0]);
   const sourcePath=resolve(process.cwd(),rawPath);
   const stamp=new Date().toISOString().replace(/[:.]/g,'-');
   await query('VACUUM INTO ?',[`${sourcePath}.before-schema-update-${stamp}.bak`]);
   console.log('Created a private SQLite snapshot before schema updates.');
  }else if(needsUpdate&&userCount&&!url.startsWith('file:')){
   throw new Error('The remote Turso schema needs changes. Create and verify a Turso snapshot before migrating it.');
  }
  for(const statement of pending)await query(statement);
  for(const [table,column,definition] of missingColumns)
   await query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  await query('UPDATE files SET storageKey=id WHERE storageKey IS NULL');
  await query('CREATE TABLE IF NOT EXISTS privateFileObjects (key text PRIMARY KEY, contents blob NOT NULL, metadata text NOT NULL DEFAULT \'{}\')');
  await query('CREATE TABLE IF NOT EXISTS blobMetadata (key text PRIMARY KEY, metadata text NOT NULL)');
  const finalTables=await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for(const table of ['users','credentials','attendance','files','settings']){
   if(!finalTables.rows.some(row=>row.name===table)){console.log(`Schema check failed: ${table} table is missing.`);process.exitCode=1;break;}
  }
  if(!process.exitCode)console.log(`SQLite schema is ready. Tables: ${finalTables.rows.length}; accounts preserved: ${userCount}. No rows were copied, reset, or seeded.`);
 }catch(error){
  console.error('SQLite schema migration failed:',error instanceof Error?error.message:'Unknown migration error.');
  process.exitCode=1;
 }finally{
  client.close();
 }
}
