import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabase } from '@/lib/database';
import { context, stmt, db, auditStmt, AppError } from '@/lib/lms/service';
import { sameOrigin } from '@/security/requests';
import { inspectUpload } from '@/lib/lms/file-types';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  try {
    await ensureDatabase();
    const row = await stmt("SELECT value FROM settings WHERE key='brand_logo'").first<{
      value: string;
    }>();
    if (row) {
      const image = JSON.parse(row.value);
      return new Response(new Uint8Array(Buffer.from(image.data, 'base64')), {
        headers: {
          'Content-Type': image.mime,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
  } catch {}
  return NextResponse.redirect(new URL('/lcps-logo.png', req.url), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const c = await context(false);
    if (c.user.role !== 'ADMIN')
      throw new AppError('Only administrators can change the college logo.', 403);
    if (Number(req.headers.get('content-length') || 0) > 600000)
      throw new AppError('Choose a logo smaller than 512 KB.', 413);
    const form = await req.formData(),
      file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > 524288)
      throw new AppError('Choose a PNG, JPG or WebP logo smaller than 512 KB.');
    const bytes = new Uint8Array(await file.arrayBuffer()),
      mime = inspectUpload(file.name, bytes, 'avatar');
    if (!mime) throw new AppError('Choose a valid PNG, JPG or WebP image.');
    await db().batch([
      stmt(
        "INSERT INTO settings(key,value) VALUES('brand_logo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify({ mime, data: Buffer.from(bytes).toString('base64') })],
      ),
      auditStmt(c.user, 'update', 'settings', 'brand_logo'),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AppError ? e.message : 'Logo upload failed.' },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
