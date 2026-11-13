export const seeds = [
  { id: '00000000-0000-4000-8000-000000000001', local_path: 'assets/photo-1.jpg', title: 'Water & stone', alt: 'A waterfall cascading down a granite cliff into clouds of mist', caption: '', visible: true, homepage: true, aspect: 'portrait', focal_x: 50, focal_y: 50, sort_order: 0 },
  { id: '00000000-0000-4000-8000-000000000002', local_path: 'assets/photo-2.jpg', title: 'Looking up', alt: 'Warm sandstone cliffs and trees under a vivid blue sky', caption: '', visible: true, homepage: true, aspect: 'landscape', focal_x: 50, focal_y: 50, sort_order: 1 },
  { id: '00000000-0000-4000-8000-000000000006', local_path: 'assets/photo-6.jpg', title: 'The quiet between', alt: 'A tall waterfall framed by trees and weathered grey rock', caption: '', visible: true, homepage: true, aspect: 'portrait', focal_x: 50, focal_y: 50, sort_order: 2 },
  { id: '00000000-0000-4000-8000-000000000004', local_path: 'assets/photo-4.jpg', title: 'Winter light', alt: 'Snow-dusted red sandstone cliffs beneath a pale blue sky', caption: '', visible: true, homepage: false, aspect: 'landscape', focal_x: 50, focal_y: 50, sort_order: 3 }
];
export const defaults = { layout: 'editorial', columns: 3, hero_id: seeds[3].id, revision: 0 };
let client;
export function getClient() {
  const { url, publishableKey } = window.PHOTO_CONFIG || {};
  if (!url || !publishableKey) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) throw new Error('The photo service URL is invalid.');
  if (!window.supabase) throw new Error('The photo service could not load. Refresh and try again.');
  return client ||= window.supabase.createClient(url, publishableKey, {
    auth: { storage: window.sessionStorage, storageKey: 'yusuf-photo-admin', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}
export function check(result) { if (result.error) throw result.error; return result.data; }
export function photoPaths(photo) { return [photo.storage_path, photo.preview_path, photo.source_path].filter(Boolean); }
function imagePaths(photo) { return [photo.storage_path, photo.preview_path].filter(Boolean); }
export async function photoURLs(photos, supabase, root = '../') {
  const paths = [...new Set(photos.flatMap(imagePaths))];
  const signed = paths.length ? check(await supabase.storage.from('photos').createSignedUrls(paths, 3600)) : [];
  if (signed.length !== paths.length || signed.some(item => item.error || !item.signedUrl)) throw new Error('A photograph could not be loaded. Try again shortly.');
  const urls = new Map(signed.map(item => [item.path, item.signedUrl]));
  return photos.map(p => ({ ...p, url: p.storage_path ? urls.get(p.storage_path) : localDisplay(root, p.local_path),
    preview_url: p.preview_path ? urls.get(p.preview_path) : p.storage_path ? urls.get(p.storage_path) : localPreview(root, p.local_path) }));
}
export function localDisplay(root, path) { return root + path.replace(/\.jpg$/, '-display.webp'); }
export function localPreview(root, path) { return root + path.replace(/\.jpg$/, '-preview.webp'); }
function publicConfig() {
  const { url, publishableKey } = window.PHOTO_CONFIG || {};
  if (!url || !publishableKey) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) throw new Error('The photo service URL is invalid.');
  return { url: url.replace(/\/$/, ''), publishableKey, fastGallery: window.PHOTO_CONFIG.fastGallery === true };
}
async function publicRequest(config, path, body) {
  const response = await fetch(config.url + path, { method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('The photo service is temporarily unavailable.');
  return response.json();
}
async function fastPublicGallery(config, root, homepage) {
  // The public project key is already in photo-config.js; it is not a session.
  // A query parameter avoids the CORS preflight required by an API key header.
  const response = await fetch(config.url + '/functions/v1/photo-gallery?view=' + (homepage ? 'home' : 'journal') + '&apikey=' + encodeURIComponent(config.publishableKey), { credentials: 'omit', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('The photo service is temporarily unavailable.');
  const data = await response.json();
  if (data?.delivery !== 'photo-gallery-v1' || !Array.isArray(data.photos) || !data.settings || data.photos.some(p => p.visible !== true || (p.storage_path && !p.url) || (p.preview_path && !p.preview_url))) throw new Error('The photo service returned an incomplete gallery.');
  return { photos: data.photos.map(p => ({ ...p,
    url: p.storage_path ? p.url : localDisplay(root, p.local_path),
    preview_url: p.preview_path ? p.preview_url : p.storage_path ? p.url : localPreview(root, p.local_path)
  })), settings: data.settings, configured: true };
}
// Always recheck published visibility; never cache gallery metadata in storage.
export async function publicGallery(root = '../', { homepage = false } = {}) {
  const config = publicConfig();
  if (!config) return { photos: seeds.map(p => ({ ...p, url: localDisplay(root, p.local_path), preview_url: localPreview(root, p.local_path) })), settings: defaults, configured: false };
  if (config.fastGallery) {
    try { return await fastPublicGallery(config, root, homepage); }
    catch { /* A fresh anonymous read remains available if the function is down. */ }
  }
  const data = await publicRequest(config, '/rest/v1/rpc/read_photo_gallery', {});
  const photos = homepage ? data.photos.filter(p => p.homepage || p.id === data.settings.hero_id) : data.photos;
  const paths = [...new Set(photos.flatMap(imagePaths))];
  const signed = paths.length ? await publicRequest(config, '/storage/v1/object/sign/photos', { paths, expiresIn: 3600 }) : [];
  if (signed.length !== paths.length || signed.some(item => item.error || !(item.signedURL || item.signedUrl))) throw new Error('A photograph could not be loaded.');
  const urls = new Map(signed.map(item => [item.path, item.signedUrl || config.url + '/storage/v1' + item.signedURL]));
  return { photos: photos.map(p => ({ ...p, url: p.storage_path ? urls.get(p.storage_path) : localDisplay(root, p.local_path),
    preview_url: p.preview_path ? urls.get(p.preview_path) : p.storage_path ? urls.get(p.storage_path) : localPreview(root, p.local_path) })), settings: data.settings, configured: true };
}
export function imageStyle(photo) { return `${Number(photo.focal_x) || 0}% ${Number(photo.focal_y) || 0}%`; }
export function arrange(photos, id, direction) {
  const next = photos.map(p => ({ ...p }));
  const index = next.findIndex(p => p.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next.map((p, sort_order) => ({ ...p, sort_order }));
}
export function validatePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, or AVIF photo.');
  if (file.size > 30 * 1024 * 1024) throw new Error('Each photo must be 30 MB or smaller.');
  if (!file.size) throw new Error('This photo is empty. Choose another file.');
}
