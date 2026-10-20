import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

process.env.NODE_ENV='development';
process.env.FILE_STORAGE_MODE='local';
delete process.env.VERCEL;
delete process.env.BLOB_READ_WRITE_TOKEN;
const root=await mkdtemp(resolve(tmpdir(),'lcps-local-storage-'));
process.env.LCPS_LOCAL_FILES_DIR=root;
try{
 const {env}=await import('../lib/platform');
 const bucket=env.BUCKET;
 assert(bucket,'Local development should provide file storage without cloud credentials.');
 const bytes=new Uint8Array([1,2,3,4]);
 await bucket.put('course-files/sample.bin',bytes,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{label:'test'}});
 const file=await bucket.get('course-files/sample.bin');
 assert(file);
 assert.deepEqual([...new Uint8Array(await new Response(file.body).arrayBuffer())],[1,2,3,4]);
 assert.deepEqual(file.customMetadata,{label:'test'});
 assert.equal((await bucket.head('course-files/sample.bin'))?.size,4);
 const listed=await bucket.list({prefix:'course-files/',limit:10});
 assert.deepEqual(listed.objects.map(item=>item.key),['course-files/sample.bin']);
 assert.deepEqual(listed.objects[0].customMetadata,{label:'test'});
 await bucket.delete('course-files/sample.bin');
 assert.equal(await bucket.get('course-files/sample.bin'),null);
 console.log('PASS local development file storage persists and lists files without Blob credentials');
}finally{
 await rm(root,{recursive:true,force:true});
}
