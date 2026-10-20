import assert from 'node:assert/strict';
import {translatePostgresQuery} from '../lib/postgres-query';

assert.equal(
 translatePostgresQuery("SELECT users.id FROM users WHERE lower(username)=lower(?) AND note='it''s ?' -- ?\nAND credentials.userId=?",['u','id']),
 "SELECT users.id FROM users WHERE lower(username)=lower($1) AND note='it''s ?' -- ?\nAND credentials.\"userId\"=$2"
);
assert.equal(
 translatePostgresQuery('INSERT INTO hodScopes ("userId","batchId") VALUES (?,?) ON CONFLICT DO NOTHING',[1,2]),
 'INSERT INTO "hodScopes" ("userId","batchId") VALUES ($1,$2) ON CONFLICT DO NOTHING'
);
assert.throws(()=>translatePostgresQuery('SELECT ?',[ ]),/parameter mismatch/);
console.log('PASS PostgreSQL SQL translation preserves literals and maps bind parameters and camelCase identifiers');
