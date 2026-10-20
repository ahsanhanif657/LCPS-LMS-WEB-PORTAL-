import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {get,put} from '@vercel/blob';
import {readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';

const dryRun=process.argv.includes('--dry-run');
const apply=process.argv.includes('--apply');
if(dryRun===apply)throw new Error('Choose exactly one mode: --dry-run or --apply.');

const url=process.env.DATABASE_URL||process.env.POSTGRES_URL;
if(!url)throw new Error('Set DATABASE_URL to the migrated PostgreSQL database.');
if(apply&&(!process.env.BLOB_READ_WRITE_TOKEN||process.env.FILE_STORAGE_MODE!=='blob'))
 throw new Error('Apply requires FILE_STORAGE_MODE=blob and BLOB_READ_WRITE_TOKEN.');

const sql=postgres(url,{max:2,connect_timeout:10,prepare:false,ssl:process.env.NODE_ENV==='production'?'require':undefined});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const localRoot=resolve(process.env.LCPS_LOCAL_FILES_DIR||resolve(process.cwd(),'.local-files'));
function localPath(key){
 const normalized=key.replace(/\/+$/,'');
 if(!normalized||!/^[\w./-]+$/.test(normalized)||normalized.split('/').some(part=>!part||part==='.'||part==='..'))
  throw new Error('Invalid local storage key.');
 const path=resolve(localRoot,...normalized.split('/'));
 if(relative(localRoot,path).startsWith('..'))throw new Error('Invalid local storage key.');
 return path;
}
async function readBlob(key){
 if(!process.env.BLOB_READ_WRITE_TOKEN)return null;
 const object=await get(key,{access:'private',useCache:false,token:process.env.BLOB_READ_WRITE_TOKEN});
 if(!object||object.statusCode!==200||!object.stream)return null;
 return new Uint8Array(await new Response(object.stream).arrayBuffer());
}
async function readLegacy(provider,key){
 if(provider==='legacy'||provider==='legacy-database'){
  const result=await sql`SELECT contents FROM "privateFileObjects" WHERE key=${key}`;
  if(result[0])return new Uint8Array(result[0].contents);
  if(provider==='legacy-database')return null;
 }
 if(provider==='blob')return readBlob(key);
 if(provider==='legacy'&&process.env.BLOB_READ_WRITE_TOKEN){
  const object=await readBlob(key);
  if(object)return object;
 }
 if((provider==='local'||provider==='legacy')&&!process.env.VERCEL){
  try{return new Uint8Array(await readFile(localPath(key)));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
 return null;
}
async function readTarget(key){
 const object=await get(key,{access:'private',useCache:false,token:process.env.BLOB_READ_WRITE_TOKEN});
 if(!object||object.statusCode!==200||!object.stream)return null;
 return new Uint8Array(await new Response(object.stream).arrayBuffer());
}

try{
 const pending=await sql`SELECT id,name,size,"storageProvider","storageKey",checksum FROM files WHERE "storageProvider"<>'blob' ORDER BY id`;
 console.log(`Found ${pending.length} file records using legacy or local storage.`);
 if(dryRun){
  for(const file of pending){
  const key=file.storageKey||file.id;
  const bytes=await readLegacy(file.storageProvider||'legacy',key);
  if(!bytes||bytes.byteLength!==Number(file.size)||file.checksum&&digest(bytes)!==file.checksum)
   throw new Error(`Legacy file integrity check failed for file record ${file.id}; no metadata was changed.`);
  }
  console.log('Dry run passed; no file objects or database records were changed.');
 }else{
  for(const file of pending){
   const sourceKey=file.storageKey||file.id;
   const bytes=await readLegacy(file.storageProvider||'legacy',sourceKey);
   if(!bytes)throw new Error(`Could not read legacy file record ${file.id}; previous files are preserved.`);
   const checksum=digest(bytes);
   if(bytes.byteLength!==Number(file.size)||file.checksum&&file.checksum!==checksum)
    throw new Error(`Legacy file integrity check failed for file record ${file.id}; metadata was not changed.`);
   const storageKey=`legacy-migrated/${file.id}`;
   await put(storageKey,bytes,{access:'private',addRandomSuffix:false,contentType:'application/octet-stream',token:process.env.BLOB_READ_WRITE_TOKEN});
   const copiedBytes=await readTarget(storageKey);
   if(!copiedBytes)throw new Error(`Blob verification failed for file record ${file.id}; the legacy copy remains intact.`);
   if(copiedBytes.byteLength!==bytes.byteLength||digest(copiedBytes)!==checksum)
    throw new Error(`Blob integrity check failed for file record ${file.id}; the legacy copy remains intact.`);
   const updated=await sql`
    UPDATE files SET "storageProvider"='blob',"storageKey"=${storageKey},checksum=${checksum}
    WHERE id=${file.id} AND "storageProvider"=${file.storageProvider} AND "storageKey" IS NOT DISTINCT FROM ${file.storageKey}
   `;
   if(updated.count!==1)throw new Error(`File metadata changed concurrently for record ${file.id}; review it before retrying.`);
   console.log(`Migrated and verified file record ${file.id}.`);
  }
  console.log('Legacy file migration completed. Source copies were retained.');
 }
}finally{
 await sql.end();
}
