import { NextResponse } from 'next/server';
import { env } from '@/lib/platform';
import { context, stmt, AppError } from '@/lib/lms/service';
import { scopedData } from '@/lib/lms/policy';
import { Row } from '@/lib/lms/types';
import { inlineFileAllowed } from '@/lib/lms/file-types';
export const dynamic = 'force-dynamic';
function contentDisposition(name: unknown, inline: boolean) {
  const value = typeof name === 'string' ? name.normalize('NFC') : '';
  const safe = value.replace(/[\r\n\\/"\x00-\x1f\x7f]/g, '_').trim().slice(0, 180);
  const fallback = safe
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/[%']/g, '_') || 'download';
  let encoded = '';
  for (const byte of new TextEncoder().encode(safe || 'download'))
    encoded += /[A-Za-z0-9!#$&+.^_`|~-]/.test(String.fromCharCode(byte))
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params,
      c = await context();
    const f = await stmt('SELECT * FROM files WHERE id=?', [id]).first<Row>();
    if (!f) throw new AppError('File not found.', 404);
    const d = scopedData(c.user, c.data);
    const visible =
      f.ownerId === c.user.id ||
      d.users.some((u) => u.avatar === id) ||
      [
        'materials',
        'assignments',
        'facultyTasks',
        'submissions',
        'quizzes',
        'timetableFiles',
        'resultFiles',
        'assessmentPolicies',
      ].some((t) => d[t].some((r) => r.fileId === id));
    if (!visible) throw new AppError('Access denied.', 403);
    if (new URL(req.url).searchParams.get('metadata') === '1')
      return NextResponse.json(
        { id: f.id, name: f.name, mime: f.mime, size: f.size, preview: inlineFileAllowed(f.mime) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    const provider = f.storageProvider || 'legacy',
      key = f.storageKey || id,
      storage = env.fileStorage(provider);
    if (!storage)
      throw new AppError(
        'This file is in a storage location unavailable to this deployment. Configure its original private storage provider or migrate the file first.',
        503,
      );
    const obj = await storage.get(key);
    if (!obj) throw new AppError('File not found in its recorded storage provider.', 404);
    const wantsPreview = new URL(req.url).searchParams.get('view') === '1',
      inline =
        (f.purpose === 'avatar' && f.mime.startsWith('image/')) ||
        (wantsPreview && inlineFileAllowed(f.mime));
    return new Response(obj.body, {
      headers: {
        'Content-Type': f.mime,
        // Quote and neutralize user-controlled filenames to prevent header injection.
        'Content-Disposition': contentDisposition(f.name, inline),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AppError ? e.message : 'File could not be opened.' },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
