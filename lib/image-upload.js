import { validatePhoto } from './photos.js?v=20261113-speed';

// Files are processed one at a time. Re-encoding strips camera metadata, while
// createImageBitmap applies the camera's EXIF orientation before drawing.
export const IMAGE_LIMITS = Object.freeze({
  display: { edge: 2048, bytes: 460 * 1024, quality: .86 },
  preview: { edge: 720, bytes: 100 * 1024, quality: .8 },
});
export function fitImage(width, height, edge) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new Error('This photo has invalid dimensions.');
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This photo could not be compressed. Try another image.')), type, quality));
}
async function encode(bitmap, limits, makeCanvas) {
  let size = fitImage(bitmap.width, bitmap.height, limits.edge);
  const canvas = makeCanvas();
  try {
    // Reduce quality first, then dimensions if a highly detailed image still
    // exceeds its transfer budget. Never silently send the large input file.
    for (let pass = 0; pass < 5; pass++) {
      canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this photo.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, size.width, size.height);
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      for (const quality of [limits.quality, .74, .62]) {
        let blob = await canvasBlob(canvas, 'image/webp', quality);
        // Browsers without WebP encoding return PNG. Use JPEG instead, so the
        // content type and extension always match the bytes actually uploaded.
        if (blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', quality);
        if (!['image/webp', 'image/jpeg'].includes(blob.type)) throw new Error('Your browser cannot compress this photo. Please use an updated browser.');
        if (blob.size > 0 && blob.size <= limits.bytes) return { blob, ...size, extension: blob.type === 'image/webp' ? 'webp' : 'jpg' };
      }
      size = fitImage(size.width, size.height, Math.max(1, Math.floor(Math.max(size.width, size.height) * .8)));
    }
    throw new Error('This photo could not be made small enough. Try a different photo.');
  } finally { canvas.width = canvas.height = 1; }
}
export async function preparePhoto(file, { decode = file => createImageBitmap(file), makeCanvas = () => document.createElement('canvas') } = {}) {
  validatePhoto(file);
  let bitmap;
  try { bitmap = await decode(file); }
  catch { throw new Error('This file could not be opened as a photo. Try a JPG, PNG, WebP, or AVIF image.'); }
  try {
    const aspect = bitmap.width === bitmap.height ? 'square' : bitmap.width > bitmap.height ? 'landscape' : 'portrait';
    const display = await encode(bitmap, IMAGE_LIMITS.display, makeCanvas);
    const preview = await encode(bitmap, IMAGE_LIMITS.preview, makeCanvas);
    return { display, preview, aspect, inputBytes: file.size };
  } finally { bitmap.close?.(); }
}
export async function uploadPrepared(bucket, prepared, { variants = true, uuid = () => crypto.randomUUID() } = {}) {
  const storage_path = `${uuid()}.${prepared.display.extension}`;
  const preview_path = variants ? `${uuid()}.${prepared.preview.extension}` : null;
  const uploaded = [];
  try {
    for (const [path, image] of [[storage_path, prepared.display], ...(preview_path ? [[preview_path, prepared.preview]] : [])]) {
      const result = await bucket.upload(path, image.blob, { contentType: image.blob.type, cacheControl: '3600', upsert: false });
      if (result.error) throw result.error;
      uploaded.push(path);
    }
    return { storage_path, ...(preview_path ? { preview_path, pixel_width: prepared.display.width, pixel_height: prepared.display.height } : {}), paths: uploaded };
  } catch (error) {
    // A failed second upload must not leave an unreferenced first file behind.
    if (uploaded.length) {
      try { const result = await bucket.remove(uploaded); if (result.error) throw result.error; }
      catch { error.cleanupPaths = uploaded; }
    }
    throw error;
  }
}
