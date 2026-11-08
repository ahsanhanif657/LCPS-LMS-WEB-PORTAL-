import { v2 as cloudinary } from 'cloudinary';

export function configuredCloudinary() {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) throw new Error('Cloudinary storage is not configured.');

  let url: URL;
  try {
    url = new URL(cloudinaryUrl);
  } catch {
    throw new Error('Cloudinary storage configuration is invalid.');
  }
  if (url.protocol !== 'cloudinary:' || !url.hostname || !url.username || !url.password)
    throw new Error('Cloudinary storage configuration is invalid.');

  cloudinary.config({
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
    secure: true,
  });
  return cloudinary;
}
