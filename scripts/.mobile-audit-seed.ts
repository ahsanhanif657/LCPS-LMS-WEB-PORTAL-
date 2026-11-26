import { database, ensureDatabase } from '../lib/database';
import { seedData } from '../lib/lms/seed';
import { hashPassword } from '../lib/lms/password';
import { tables } from '../lib/lms/types';

await ensureDatabase();
const data = seedData();
const passwordHash = await hashPassword('MobileAuditPass!23');
const users = data.users.map((user) => ({ ...user, demo: 0, passwordChangeRequired: 0, permissions: '{}' }));
const template = users.find((user) => user.id === 'admin');
const extraRoles = ['SUPER_ADMIN', 'DIRECTOR', 'TREASURER', 'EXAMINATION_CONTROLLER', 'REGISTRAR'];
for (const role of extraRoles) {
  const id = role.toLowerCase();
  users.push({ ...template, id, name: `Audit ${role.replaceAll('_', ' ')}`, username: id, role, departmentId: null, batchId: null, identifier: `AUDIT-${role}`, demo: 0, passwordChangeRequired: 0, permissions: '{}' });
}
const insertRow = async (table, row) => {
  const keys = Object.keys(row);
  await database.prepare(`INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((key) => row[key] ?? null)).run();
};
for (const table of tables) {
  if (table === 'users') {
    for (const user of users) await insertRow('users', user);
  } else {
    for (const row of data[table] || []) await insertRow(table, row);
  }
}
for (const user of users) await database.prepare('INSERT INTO credentials(userId,hash) VALUES(?,?)').bind(user.id, passwordHash).run();
for (const [key, value] of [['college_auth_v2', '1'], ['owner', 'super_admin'], ['college', 'LCPS Mobile Audit']]) await database.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind(key, value).run();
console.log(`Seeded ${users.length} local test accounts and ${tables.length - 1} data tables.`);
