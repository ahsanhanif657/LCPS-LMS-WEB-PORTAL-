import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { configuredCloudinary } from '@/lib/cloudinary';
import { context, AppError, db, insert, stmt } from '@/lib/lms/service';
import {
  maxBookUploadBytes,
  inspectResourceUpload,
  resourceExtensionAllowed,
} from '@/lib/lms/file-types';
import { uid } from '@/lib/lms/types';
import { permitted } from '@/security/privileges';
import { materialsAllowed } from '@/lib/lms/policy';
import { jsonBody, sameOrigin } from '@/security/requests';
import { rateLimit } from '@/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bookFormats = 'png,jpg,jpeg,webp,pdf,doc,docx,xls,xlsx,ppt,pptx,csv,zip';
const bookMime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  zip: 'application/zip',
};

async function bookOffering(body: Record<string, unknown>, c: Awaited<ReturnType<typeof context>>) {
  const offeringId = body.offeringId;
  if (typeof offeringId !== 'string' || !offeringId)
    throw new AppError('Select a subject and class for this book.', 400);
  const offering = c.data.offerings.find((item) => item.id === offeringId);
  if (
    !offering ||
    !permitted(c.user, 'materials', c.rolePrivileges) ||
    !materialsAllowed(
      c.user,
      offering,
      c.data.batches.find((item) => item.id === offering.batchId),
    )
  )
    throw new AppError('You may only upload books to your authorized subjects.', 403);
  const batch = c.data.batches.find((item) => item.id === offering.batchId);
  if (!batch) throw new AppError('The selected subject session could not be found.', 400);
  const materialId = typeof body.materialId === 'string' ? body.materialId : '';
  if (
    materialId &&
    !c.data.materials.some(
      (item) =>
        item.id === materialId && item.offeringId === offering.id && item.resourceType === 'Book',
    )
  )
    throw new AppError('The book being replaced could not be found.', 400);
  const count = await stmt(
    `SELECT count(*) AS total FROM materials m
     JOIN offerings o ON o.id=m.offeringId
     JOIN batches b ON b.id=o.batchId
     WHERE o.subjectId=? AND b.sessionId=? AND m.resourceType='Book' AND m.id<>?`,
    [offering.subjectId, batch.sessionId, materialId],
  ).first<{ total: number }>();
  if (Number(count?.total || 0) >= 2)
    throw new AppError('Only two books can be added for this subject in a session.', 400);
  return { offering, batch };
}

function cleanName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new AppError('Choose a valid book file name.', 400);
  const name = value.replace(/[^\w.\- ()]/g, '_').slice(0, 150);
  if (!resourceExtensionAllowed(name, 'Book'))
    throw new AppError('Books must use one of the supported resource file formats.', 400);
  return name;
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await jsonBody(request, 12000);
    const c = await context();
    await rateLimit('upload:' + c.user.id, 30, 60000);
    const { offering } = await bookOffering(body, c);
    const fileName = cleanName(body.fileName);
    if (body.resourceType !== 'Book')
      throw new AppError('This upload route is only for books.', 400);
    const cloudinary = configuredCloudinary();
    const config = cloudinary.config();

    if (body.action === 'sign') {
      if (
        typeof body.fileSize !== 'number' ||
        !Number.isInteger(body.fileSize) ||
        body.fileSize < 1 ||
        body.fileSize > maxBookUploadBytes
      )
        throw new AppError('A book must be 25 MB or smaller.', 413);
      const timestamp = Math.floor(Date.now() / 1000);
      const publicId = `lcps-lms/books/${c.user.id}/${uid()}`;
      const signed = {
        timestamp,
        public_id: publicId,
        type: 'authenticated',
        allowed_formats: bookFormats,
      };
      return NextResponse.json({
        cloudName: config.cloud_name,
        apiKey: config.api_key,
        publicId,
        timestamp,
        signature: cloudinary.utils.api_sign_request(signed, config.api_secret!),
        type: signed.type,
        allowedFormats: signed.allowed_formats,
        offeringId: offering.id,
      });
    }

    if (body.action !== 'verify' || typeof body.publicId !== 'string')
      throw new AppError('Invalid book upload request.', 400);
    if (!body.publicId.startsWith(`lcps-lms/books/${c.user.id}/`))
      throw new AppError('This book upload does not belong to your account.', 403);
    const item = await cloudinary.api.resource(body.publicId, {
      resource_type: 'raw',
      type: 'authenticated',
    });
    if (
      !Number.isInteger(item.bytes) ||
      item.bytes < 1 ||
      item.bytes > maxBookUploadBytes ||
      !bookMime[item.format]
    ) {
      await cloudinary.uploader.destroy(body.publicId, {
        resource_type: 'raw',
        type: 'authenticated',
        invalidate: true,
      });
      throw new AppError('The book must be a supported file no larger than 25 MB.', 400);
    }
    const signedUrl = cloudinary.utils.private_download_url(body.publicId, item.format, {
      resource_type: 'raw',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const download = await fetch(signedUrl, { cache: 'no-store' });
    if (!download.ok) throw new AppError('The uploaded book could not be verified.', 400);
    const bytes = new Uint8Array(await download.arrayBuffer());
    const mime = inspectResourceUpload(fileName, bytes, 'Book');
    if (!mime || mime !== bookMime[item.format]) {
      await cloudinary.uploader.destroy(body.publicId, {
        resource_type: 'raw',
        type: 'authenticated',
        invalidate: true,
      });
      throw new AppError('The book file does not match its file type.', 400);
    }

    const id = uid();
    await db().batch([
      insert('files', {
        id,
        ownerId: c.user.id,
        name: fileName,
        mime,
        size: item.bytes,
        purpose: 'academic',
        createdAt: new Date().toISOString(),
        storageProvider: 'cloudinary',
        storageKey: body.publicId,
        checksum: createHash('sha256').update(bytes).digest('hex'),
      }),
    ]);
    return NextResponse.json({ id, name: fileName, mime, size: item.bytes });
  } catch (error) {
    if (error instanceof AppError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(
      'Cloudinary book upload failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return NextResponse.json(
      { error: 'The book upload could not be completed. Please try again.' },
      { status: 503 },
    );
  }
}
