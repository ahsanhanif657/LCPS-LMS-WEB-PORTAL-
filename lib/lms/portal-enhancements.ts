import { Context, AppError, stmt, db, insert, auditStmt } from './service';
import { Row, uid } from './types';
import { permitted } from '@/security/privileges';
import { hashPassword } from './password';
function check(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new AppError(message, status);
}
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export async function portalEnhancementAction(c: Context, body: Row) {
  const u = c.user,
    d = c.data;
  if (body.action === 'socialAccountNames') {
    check(u.role === 'ADMIN', 'Only administrators can update account labels.', 403);
    check(
      Array.isArray(body.names) &&
        body.names.length === 5 &&
        body.names.every(
          (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 100,
        ),
      'Enter five account names (up to 100 characters).',
    );
    await db().batch([
      stmt(
        "INSERT INTO settings(key,value) VALUES('social_account_names',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify(body.names.map((v: string) => v.trim()))],
      ),
      auditStmt(u, 'update', 'settings', 'social_account_names'),
    ]);
    return { ok: true };
  }
  if (body.action === 'profile') {
    const r = body.record || {};
    check(
      typeof r.name === 'string' && r.name.trim().length > 1 && r.name.length <= 100,
      'Enter your full name.',
    );
    for (const [key, limit] of Object.entries({
      phone: 40,
      qualifications: 4000,
      bio: 1000,
      profileLinks: 2000,
      profileNote: 60,
    }))
      check(
        r[key] === undefined || (typeof r[key] === 'string' && r[key].length <= limit),
        `${key} is too long or invalid.`,
      );
    if (r.profileLinks)
      for (const link of r.profileLinks
        .split('\n')
        .map((v: string) => v.trim())
        .filter(Boolean)) {
        let url;
        try {
          url = new URL(link);
        } catch {
          throw new AppError('Profile links must be valid HTTPS URLs.');
        }
        check(
          url.protocol === 'https:' && !url.username && !url.password,
          'Profile links must use HTTPS.',
        );
      }
    const keys = ['name', 'phone', 'qualifications', 'bio', 'profileLinks', 'profileNote'].filter(
      (k) => k in r,
    );
    await db().batch([
      stmt(`UPDATE users SET ${keys.map((k) => `"${k}"=?`).join(',')} WHERE id=?`, [
        ...keys.map((k) => r[k].trim() || null),
        u.id,
      ]),
      auditStmt(u, 'update', 'profile', u.id),
    ]);
    return { ok: true };
  }
  if (['saveScheduleEvent', 'deleteScheduleEvent'].includes(body.action)) {
    check(permitted(u, 'timetable', c.rolePrivileges), 'Timetable editing is not permitted.', 403);
    const r = body.record || {},
      old = r.id ? d.scheduleEvents.find((e) => e.id === r.id) : null;
    if (r.id) check(old, 'Activity no longer exists.', 404);
    const batch = d.batches.find((b) => b.id === (old?.batchId || r.batchId));
    check(batch, 'Select a class.');
    check(
      ['ADMIN', 'PRINCIPAL'].includes(u.role) || batch.departmentId === u.departmentId,
      'Choose a class in your department.',
      403,
    );
    if (body.action === 'deleteScheduleEvent') {
      check(old, 'Select an activity.');
      await db().batch([
        stmt('DELETE FROM scheduleEvents WHERE id=?', [old.id]),
        auditStmt(u, 'delete', 'scheduleEvents', old.id),
      ]);
      return { ok: true };
    }
    check(
      ['Break', 'Library assignment', 'Other activity'].includes(r.kind),
      'Choose an activity type.',
    );
    check(
      typeof r.title === 'string' && r.title.trim() && r.title.length <= 150,
      'Enter a title (up to 150 characters).',
    );
    check(
      days.includes(r.day) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(r.startTime) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(r.endTime) &&
        r.endTime > r.startTime,
      'Choose a valid day and time range.',
    );
    check(!r.room || (typeof r.room === 'string' && r.room.length <= 100), 'Room is too long.');
    const collides = (a: Row) =>
      a.id !== old?.id && a.day === r.day && a.startTime < r.endTime && r.startTime < a.endTime;
    check(
      !d.scheduleEvents.some(
        (a) =>
          collides(a) &&
          (a.batchId === batch.id ||
            (r.room && a.room?.trim().toLowerCase() === r.room.trim().toLowerCase())),
      ) &&
        !d.timetable.some(
          (a) =>
            collides(a) &&
            (d.offerings.some((o) => o.id === a.offeringId && o.batchId === batch.id) ||
              (r.room && a.room?.trim().toLowerCase() === r.room.trim().toLowerCase())),
        ),
      'This activity conflicts with the class or room.',
      409,
    );
    const row = {
      id: old?.id || uid(),
      batchId: batch.id,
      kind: r.kind,
      title: r.title.trim(),
      day: r.day,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room?.trim() || null,
      updatedBy: u.id,
    };
    await db().batch([
      old
        ? stmt(
            'UPDATE scheduleEvents SET kind=?,title=?,day=?,startTime=?,endTime=?,room=?,updatedBy=? WHERE id=?',
            [row.kind, row.title, row.day, row.startTime, row.endTime, row.room, u.id, row.id],
          )
        : insert('scheduleEvents', row),
      auditStmt(u, old ? 'update' : 'create', 'scheduleEvents', row.id),
    ]);
    return row;
  }
  if (['validateStudentImport', 'importStudents'].includes(body.action)) {
    check(
      permitted(u, 'users', c.rolePrivileges) &&
        permitted(u, 'student_enrollment', c.rolePrivileges),
      'Student account and enrollment permissions are required.',
      403,
    );
    const batch = d.batches.find((b) => b.id === body.batchId && b.active);
    check(batch, 'Select an active class.');
    check(
      ['ADMIN', 'PRINCIPAL'].includes(u.role) || batch.departmentId === u.departmentId,
      'Import students only into your department.',
      403,
    );
    const rows = body.rows;
    check(
      Array.isArray(rows) &&
        rows.length > 0 &&
        rows.length <= (body.action === 'importStudents' ? 10 : 500),
      'Import 1–500 students; save in groups of up to 10.',
    );
    const seen = {
      username: new Set<string>(),
      email: new Set<string>(),
      identifier: new Set<string>(),
    };
    const errors: string[] = [];
    const normalized: Row[] = rows.map((raw: Row, index: number) => {
      const r: Row = {};
      for (const key of ['name', 'username', 'identifier', 'email', 'phone', 'password'])
        r[key] = typeof raw?.[key] === 'string' ? raw[key].trim() : '';
      r.username = r.username.toLowerCase();
      r.email = r.email.toLowerCase();
      if (r.name.length < 2 || r.name.length > 100)
        errors.push(`Row ${index + 1}: full name must be 2–100 characters.`);
      if (!/^[a-z0-9._@-]{3,100}$/.test(r.username))
        errors.push(`Row ${index + 1}: invalid username.`);
      if (!r.identifier || r.identifier.length > 100)
        errors.push(`Row ${index + 1}: roll number is required (up to 100 characters).`);
      if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
        errors.push(`Row ${index + 1}: invalid email.`);
      if (r.phone.length > 40 || r.email.length > 200)
        errors.push(`Row ${index + 1}: contact details are too long.`);
      if (r.password.length < 10 || r.password.length > 128)
        errors.push(`Row ${index + 1}: password must be 10–128 characters.`);
      for (const key of ['username', 'email', 'identifier'] as const) {
        const value = r[key].toLowerCase();
        if (
          value &&
          (seen[key].has(value) ||
            d.users.some((user) => String(user[key] || '').toLowerCase() === value))
        )
          errors.push(`Row ${index + 1}: ${key} already exists or is duplicated: ${r[key]}.`);
        if (value) seen[key].add(value);
      }
      return r;
    });
    if (errors.length) return { valid: false, errors: errors.slice(0, 100) };
    if (body.action === 'validateStudentImport')
      return { valid: true, count: rows.length, errors: [] };
    const writes: ReturnType<typeof stmt>[] = [];
    const created: Row[] = [];
    for (const r of normalized) {
      const id = uid(),
        hash = await hashPassword(r.password);
      writes.push(
        insert('users', {
          id,
          name: r.name,
          username: r.username,
          identifier: r.identifier,
          email: r.email || null,
          phone: r.phone || null,
          role: 'STUDENT',
          departmentId: batch.departmentId,
          batchId: batch.id,
          active: 1,
          demo: 0,
          createdAt: new Date().toISOString(),
          passwordChangeRequired: 1,
          passwordPolicyVersion: 1,
        }),
        insert('credentials', { userId: id, hash }),
      );
      for (const offering of d.offerings.filter((o) => o.batchId === batch.id && o.active))
        writes.push(
          insert('enrollments', { id: uid(), studentId: id, offeringId: offering.id, active: 1 }),
        );
      writes.push(auditStmt(u, 'bulk-create', 'users', id));
      created.push({ id, name: r.name, username: r.username, identifier: r.identifier });
    }
    await db().batch(writes);
    return { valid: true, created };
  }
  return undefined;
}
