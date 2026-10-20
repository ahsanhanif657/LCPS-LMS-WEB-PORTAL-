import {createClient,type Client} from '@libsql/client';
import {AppError} from '@/security/errors';
import {migrations,supplementalMigrations} from '@/db/migrations';
import {resolve} from 'node:path';

type ResultRow=Record<string,unknown>;
type DatabaseResult<T=ResultRow>={results:T[];meta:{changes:number}};

let client:Client|undefined;
function sqlClient(){
 if(client)return client;
 const url=process.env.TURSO_DATABASE_URL;
 if(!url)throw new AppError('SQLite is not connected. Configure TURSO_DATABASE_URL in the server environment.',503);
 return client=createClient({url,...(process.env.TURSO_AUTH_TOKEN?{authToken:process.env.TURSO_AUTH_TOKEN}:{})});
}

async function execute<T=ResultRow>(sql:string,args:unknown[]=[]):Promise<DatabaseResult<T>>{
 const result=await sqlClient().execute({sql,args:args as never[]});
 return {results:result.rows as T[],meta:{changes:Number(result.rowsAffected)}};
}

class Statement{
 constructor(public sql:string,public args:unknown[]=[]){}
 bind(...args:unknown[]){return new Statement(this.sql,args.map(value=>value??null));}
 async all<T=ResultRow>(){return execute<T>(this.sql,this.args);}
 async first<T=ResultRow>():Promise<T|null>{return (await this.all<T>()).results[0]??null;}
 async run(){return execute(this.sql,this.args);}
}

export const database={
 prepare:(sql:string)=>new Statement(sql),
 async batch(statements:Statement[]){
  if(!statements.length)return [] as DatabaseResult[];
  const results=await sqlClient().batch(statements.map(statement=>({sql:statement.sql,args:statement.args as never[]})),'write');
  return results.map(result=>({results:result.rows as ResultRow[],meta:{changes:Number(result.rowsAffected)}}));
 }
};

async function hasObject(type:string,name:string){
 const result=await sqlClient().execute({sql:'SELECT 1 FROM sqlite_master WHERE type=? AND name=? LIMIT 1',args:[type,name]});
 return result.rows.length>0;
}

async function hasColumn(table:string,column:string){
 const result=await sqlClient().execute(`PRAGMA table_info("${table.replaceAll('"','""')}")`);
 return result.rows.some(row=>row.name===column);
}

async function pendingLegacyMigrations(){
 const pending:string[]=[];
 for(const migration of [...migrations,...supplementalMigrations])for(const statement of migration.statements){
  const create=statement.match(/^\s*CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z0-9_]+)[`"]?/i);
  if(create){if(create[1].toLowerCase()==='index'&&create[2]==='subjects_code_unique')continue;if(!await hasObject(create[1].toLowerCase(),create[2]))pending.push(statement);continue;}
  const drop=statement.match(/^\s*DROP\s+INDEX\s+IF\s+EXISTS\s+[`"]?([A-Za-z0-9_]+)[`"]?/i);
  if(drop){if(await hasObject('index',drop[1]))pending.push(statement);continue;}
  const alter=statement.match(/^\s*ALTER\s+TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+ADD\s+(?:COLUMN\s+)?[`"]?([A-Za-z0-9_]+)[`"]?/i);
  if(alter){if(!await hasColumn(alter[1],alter[2]))pending.push(statement);continue;}
  pending.push(statement);
 }
 return pending;
}

async function createLocalSnapshotIfNeeded(hasChanges:boolean){
 const url=process.env.TURSO_DATABASE_URL||'';
 if(!hasChanges||!url.startsWith('file:')||!await hasObject('table','users'))return;
 const count=await sqlClient().execute('SELECT COUNT(*) AS count FROM users');
 if(!Number(count.rows[0]?.count))return;
 const rawPath=decodeURIComponent(url.slice(5).split('?')[0]);
 const sourcePath=resolve(process.cwd(),rawPath);
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 await sqlClient().execute({sql:'VACUUM INTO ?',args:[`${sourcePath}.before-schema-update-${stamp}.bak`]});
}

async function runLegacyMigrations(){
 const pending=await pendingLegacyMigrations();
 const needsFileColumns=!(await hasColumn('files','storageProvider'))||
  !(await hasColumn('files','storageKey'))||
  !(await hasColumn('files','checksum'))||
  !(await hasColumn('quizzes','fileId'));
 await createLocalSnapshotIfNeeded(pending.length>0||needsFileColumns);
 for(const statement of pending)await sqlClient().execute(statement);
}

async function ensureColumn(table:string,column:string,definition:string){
 if(await hasColumn(table,column))return;
 await sqlClient().execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
}

let ready:Promise<void>|undefined;
export function ensureDatabase(){
 if(!ready)ready=(async()=>{
  try{
   await runLegacyMigrations();
   await ensureColumn('files','storageProvider',"text NOT NULL DEFAULT 'legacy'");
   await ensureColumn('files','storageKey','text');
   await ensureColumn('files','checksum','text');
   await ensureColumn('quizzes','fileId','text');
   await sqlClient().execute('UPDATE files SET storageKey=id WHERE storageKey IS NULL');
   await sqlClient().execute('CREATE TABLE IF NOT EXISTS privateFileObjects (key text PRIMARY KEY, contents blob NOT NULL, metadata text NOT NULL DEFAULT \'{}\')');
   await sqlClient().execute('CREATE TABLE IF NOT EXISTS blobMetadata (key text PRIMARY KEY, metadata text NOT NULL)');
  }catch(error){
   if(error instanceof AppError)throw error;
   throw new AppError('SQLite is unavailable or its schema could not be upgraded safely. Check TURSO_DATABASE_URL and preserve a database backup before retrying.',503);
  }
 })().catch(error=>{ready=undefined;throw error;});
 return ready;
}
