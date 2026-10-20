import assert from 'node:assert/strict';

process.env.NODE_ENV='production';
process.env.VERCEL='1';
process.env.FILE_STORAGE_MODE='blob';
delete process.env.BLOB_READ_WRITE_TOKEN;
const {env}=await import('../lib/platform');
assert.equal(env.STORAGE_MODE,'unavailable');
assert.equal(env.BUCKET,undefined);
process.env.FILE_STORAGE_MODE='local';
assert.equal(env.STORAGE_MODE,'unavailable');
assert.equal(env.BUCKET,undefined);
process.env.FILE_STORAGE_MODE='blob';
process.env.BLOB_READ_WRITE_TOKEN='test-only-blob-token';
assert.equal(env.STORAGE_MODE,'blob');
assert(env.BUCKET);
console.log('PASS cloud uploads require explicitly configured private Blob storage; no implicit database fallback');
