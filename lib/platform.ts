import {put,get,del,head,list} from '@vercel/blob';
import {database} from './database';
import {mkdir,readFile,writeFile,stat,rm,readdir} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
const metadata=async(key:string)=>{const row=await database.prepare('SELECT metadata FROM blobMetadata WHERE key=?').bind(key).first<{metadata:string}>();return row?JSON.parse(row.metadata):{};};
const localRoot=resolve(process.env.LCPS_LOCAL_FILES_DIR||resolve(process.cwd(),'.local-files'));
const localPath=(key:string)=>{
 const normalized=key.replace(/\/+$/,'');
 if(!normalized||!/^[\w./-]+$/.test(normalized)||normalized.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('Invalid local storage key.');
 const path=resolve(localRoot,...normalized.split('/'));
 if(relative(localRoot,path).startsWith('..'))throw new Error('Invalid local storage key.');
 return path;
};
const localBucket={
 async put(key:string,bytes:string|Uint8Array,options:{httpMetadata?:{contentType:string};customMetadata?:Record<string,string>}={}){
  const path=localPath(key);await mkdir(dirname(path),{recursive:true});await writeFile(path,typeof bytes==='string'?bytes:Buffer.from(bytes));await writeFile(path+'.metadata.json',JSON.stringify(options.customMetadata||{}));
 },
 async get(key:string){
  try{const body=await readFile(localPath(key));return {body,size:body.length,customMetadata:JSON.parse(await readFile(localPath(key)+'.metadata.json','utf8').catch(()=> '{}')),text:async()=>body.toString('utf8')};}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
 },
 async head(key:string){try{const info=await stat(localPath(key));return {size:info.size};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}},
 async delete(key:string){await Promise.all([rm(localPath(key),{force:true}),rm(localPath(key)+'.metadata.json',{force:true})]);},
 async list(options:{prefix:string;limit:number;include?:string[]}){
  const start=localPath(options.prefix),entries:Array<{key:string;size:number;customMetadata:Record<string,string>}>=[];
  async function walk(dir:string){
   for(const item of await readdir(dir,{withFileTypes:true}).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [];throw e;})){
    const path=resolve(dir,item.name);
    if(item.isDirectory()){await walk(path);continue;}
    if(!item.isFile()||item.name.endsWith('.metadata.json'))continue;
    const key=relative(localRoot,path).split('\\').join('/');
    if(!key.startsWith(options.prefix))continue;
    const info=await stat(path),customMetadata=JSON.parse(await readFile(path+'.metadata.json','utf8').catch(()=> '{}'));
    entries.push({key,size:info.size,customMetadata});
   }
  }
  await walk(start);
  entries.sort((a,b)=>a.key.localeCompare(b.key));
  return {objects:entries.slice(0,options.limit),truncated:entries.length>options.limit};
 }
};
const legacyDatabaseBucket={
 async put(key:string,bytes:string|Uint8Array,options:{httpMetadata?:{contentType:string};customMetadata?:Record<string,string>}={}){
  const body=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;
  await database.prepare('INSERT INTO privateFileObjects(key,contents,metadata) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET contents=excluded.contents,metadata=excluded.metadata')
   .bind(key,body,JSON.stringify(options.customMetadata||{})).run();
 },
 async get(key:string){
  const row=await database.prepare('SELECT contents,metadata FROM privateFileObjects WHERE key=?').bind(key).first<{contents:Uint8Array;metadata:string}>();
  if(!row)return null;
  const body=new Uint8Array(row.contents);
  return {body,size:body.byteLength,customMetadata:JSON.parse(row.metadata),text:async()=>new TextDecoder().decode(body)};
 },
 async head(key:string){
  return await database.prepare('SELECT length(contents) AS size FROM privateFileObjects WHERE key=?').bind(key).first<{size:number}>();
 },
 async delete(key:string){
  await database.prepare('DELETE FROM privateFileObjects WHERE key=?').bind(key).run();
 },
 async list(options:{prefix:string;limit:number;include?:string[]}){
  const rows=(await database.prepare('SELECT key,length(contents) AS size,metadata FROM privateFileObjects WHERE substr(key,1,?)=? ORDER BY key LIMIT ?')
   .bind(options.prefix.length,options.prefix,options.limit+1).all<{key:string;size:number;metadata:string}>()).results;
  return {objects:rows.slice(0,options.limit).map(row=>({key:row.key,size:row.size,customMetadata:JSON.parse(row.metadata)})),truncated:rows.length>options.limit};
 }
};
const bucket={
 async put(key:string,bytes:string|Uint8Array,options:{httpMetadata?:{contentType:string};customMetadata?:Record<string,string>}={}){
  const body=typeof bytes==='string'?bytes:Buffer.from(bytes);
  await put(key,body,{access:'private',addRandomSuffix:false,contentType:options.httpMetadata?.contentType||'application/octet-stream',token:process.env.BLOB_READ_WRITE_TOKEN});
  try{await database.prepare('INSERT INTO blobMetadata(key,metadata) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET metadata=excluded.metadata').bind(key,JSON.stringify(options.customMetadata||{})).run();}
  catch(e){await del(key,{token:process.env.BLOB_READ_WRITE_TOKEN});throw e;}
 },
 async get(key:string){
  const r=await get(key,{access:'private',useCache:false,token:process.env.BLOB_READ_WRITE_TOKEN});if(!r||r.statusCode!==200||!r.stream)return null;
  return {body:r.stream,size:r.blob.size||0,customMetadata:await metadata(key),text:async()=>new Response(r.stream).text()};
 },
 async head(key:string){try{return await head(key,{token:process.env.BLOB_READ_WRITE_TOKEN});}catch(e){if((e as Error).name==='BlobNotFoundError')return null;throw e;}},
 async delete(key:string){await del(key,{token:process.env.BLOB_READ_WRITE_TOKEN});await database.prepare('DELETE FROM blobMetadata WHERE key=?').bind(key).run();},
 async list(options:{prefix:string;limit:number;include?:string[]}){
  const r=await list({prefix:options.prefix,limit:options.limit,token:process.env.BLOB_READ_WRITE_TOKEN});
  const keys=r.blobs.map(b=>b.pathname);const rows=keys.length?(await database.prepare('SELECT key,metadata FROM blobMetadata WHERE key IN ('+keys.map(()=>'?').join(',')+')').bind(...keys).all<{key:string;metadata:string}>()).results:[];
  return {objects:r.blobs.map(b=>({key:b.pathname,size:b.size,customMetadata:JSON.parse(rows.find(r=>r.key===b.pathname)?.metadata||'{}')})),truncated:r.hasMore};
 }
};
type FileProvider='blob'|'local'|'legacy'|'legacy-database';
const configuredMode=()=>process.env.FILE_STORAGE_MODE;
const modeAvailable=()=>{
 const mode=configuredMode();
 if(mode==='blob')return !!process.env.BLOB_READ_WRITE_TOKEN;
 if(mode==='local')return !process.env.VERCEL;
 return false;
};
const legacyBucket={
 async get(key:string){
  const databaseObject=await legacyDatabaseBucket.get(key);
  if(databaseObject)return databaseObject;
  if(process.env.BLOB_READ_WRITE_TOKEN){const object=await bucket.get(key);if(object)return object;}
  if(!process.env.VERCEL){const object=await localBucket.get(key);if(object)return object;}
  return null;
 },
 async head(key:string){
  const databaseObject=await legacyDatabaseBucket.head(key);
  if(databaseObject)return databaseObject;
  if(process.env.BLOB_READ_WRITE_TOKEN){const object=await bucket.head(key);if(object)return object;}
  if(!process.env.VERCEL){const object=await localBucket.head(key);if(object)return object;}
  return null;
 },
 async delete(key:string){await legacyDatabaseBucket.delete(key);}
};
export const env={
 DB:database,
 get STORAGE_MODE():'blob'|'local'|'unavailable'{return modeAvailable()?configuredMode() as 'blob'|'local':'unavailable';},
 get BUCKET(){if(!modeAvailable())return undefined;return configuredMode()==='blob'?bucket:localBucket;},
 fileStorage(provider:FileProvider){
  if(provider==='blob')return process.env.BLOB_READ_WRITE_TOKEN?bucket:undefined;
  if(provider==='local')return !process.env.VERCEL?localBucket:undefined;
  if(provider==='legacy-database')return legacyDatabaseBucket;
  return legacyBucket;
 }
};
