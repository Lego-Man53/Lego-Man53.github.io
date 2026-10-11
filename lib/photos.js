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
export async function photoURLs(photos, supabase, root = '../') {
  const paths = photos.filter(p => p.storage_path).map(p => p.storage_path);
  const signed = paths.length ? check(await supabase.storage.from('photos').createSignedUrls(paths, 3600)) : [];
  if (signed.some(item => item.error || !item.signedUrl)) throw new Error('A photograph could not be loaded. Try again shortly.');
  const urls = new Map(signed.map(item => [item.path, item.signedUrl]));
  return photos.map(p => ({ ...p, url: p.storage_path ? urls.get(p.storage_path) : root + p.local_path }));
}
export async function publicGallery(root = '../') {
  const supabase = getClient();
  if (!supabase) return { photos: seeds.map(p => ({ ...p, url: root + p.local_path })), settings: defaults, configured: false };
  const data = check(await supabase.rpc('read_photo_gallery'));
  return { photos: await photoURLs(data.photos, supabase, root), settings: data.settings, configured: true };
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
  if (file.size > 15 * 1024 * 1024) throw new Error('Each photo must be smaller than 15 MB.');
  if (!file.size) throw new Error('This photo is empty. Choose another file.');
}
