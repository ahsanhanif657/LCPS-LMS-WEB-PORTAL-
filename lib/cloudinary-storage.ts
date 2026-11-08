import { configuredCloudinary } from './cloudinary';

function isNotFound(error: unknown) {
  return (
    typeof error === 'object' && error !== null && 'http_code' in error && error.http_code === 404
  );
}

async function resource(publicId: string) {
  const cloudinary = configuredCloudinary();
  return cloudinary.api.resource(publicId, {
    resource_type: 'raw',
    type: 'authenticated',
  });
}

export const cloudinaryStorage = {
  async put(
    key: string,
    bytes: string | Uint8Array,
    options: { httpMetadata?: { contentType: string } } = {},
  ) {
    const body = typeof bytes === 'string' ? bytes : Buffer.from(bytes);
    await configuredCloudinary().uploader.upload(
      `data:${options.httpMetadata?.contentType || 'application/octet-stream'};base64,${body.toString('base64')}`,
      { public_id: key, resource_type: 'raw', type: 'authenticated' },
    );
  },
  async get(key: string) {
    const cloudinary = configuredCloudinary();
    const item = await resource(key);
    const url = cloudinary.utils.private_download_url(key, item.format, {
      resource_type: 'raw',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok || !response.body)
      throw new Error(`Cloudinary file download failed (${response.status}).`);
    return {
      body: response.body,
      size: Number(response.headers.get('content-length')) || item.bytes,
      customMetadata: {},
      text: async () => response.text(),
    };
  },
  async head(key: string) {
    try {
      const item = await resource(key);
      return { size: item.bytes };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },
  async delete(key: string) {
    await configuredCloudinary().uploader.destroy(key, {
      resource_type: 'raw',
      type: 'authenticated',
      invalidate: true,
    });
  },
  async list(options: { prefix: string; limit: number }) {
    const result = await configuredCloudinary().api.resources({
      resource_type: 'raw',
      type: 'authenticated',
      prefix: options.prefix,
      max_results: options.limit,
    });
    return {
      objects: result.resources.map((item: { public_id: string; bytes: number }) => ({
        key: item.public_id,
        size: item.bytes,
        customMetadata: {},
      })),
      truncated: result.resources.length === options.limit,
    };
  },
};
