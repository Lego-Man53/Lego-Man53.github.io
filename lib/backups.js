import { check } from './photos.js?v=20261113-speed';

async function storageObjects(client) {
  const objects = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = check(await client.storage.from('photos').list('', { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }));
    objects.push(...page.filter(item => item.id));
    if (page.length < 1000) return objects;
  }
  throw new Error('Storage contains too many files for this cleanup. No files were deleted.');
}
export function planBackupRemoval(gallery, objects) {
  const active = new Set(gallery.photos.flatMap(photo => [photo.storage_path, photo.preview_path]).filter(Boolean));
  const files = new Map(objects.map(file => [file.name, file]));
  const backups = [], references = new Set();
  for (const photo of gallery.photos) {
    if (!photo.source_path) continue;
    if (active.has(photo.source_path)) throw new Error('A backup is still used by the website. No files can be deleted.');
    for (const path of [photo.storage_path, photo.preview_path]) {
      const file = files.get(path);
      if (!path || !file || !(Number(file.metadata?.size) > 0)) throw new Error(`The compressed copies of “${photo.title}” could not be verified. No files can be deleted.`);
    }
    references.add(photo.source_path);
    const original = files.get(photo.source_path);
    if (original && !backups.some(file => file.path === photo.source_path)) backups.push({ path: photo.source_path, title: photo.title, bytes: Number(original.metadata?.size) || 0 });
  }
  backups.sort((a, b) => a.path.localeCompare(b.path));
  return { backups, references: [...references].sort(), bytes: backups.reduce((sum, file) => sum + file.bytes, 0),
    revision: gallery.settings.revision, photoCount: gallery.photos.length,
    fingerprint: JSON.stringify(backups.map(file => [file.path, file.bytes])) };
}
export async function reviewBackups(client) {
  // The protected RPC checks admin membership; the same user's RLS controls storage.
  const gallery = check(await client.rpc('read_photo_admin'));
  return planBackupRemoval(gallery, await storageObjects(client));
}
export async function removeReviewedBackups(client, reviewed) {
  const fresh = await reviewBackups(client);
  if (fresh.revision !== reviewed.revision || fresh.fingerprint !== reviewed.fingerprint || JSON.stringify(fresh.references) !== JSON.stringify(reviewed.references)) {
    throw new Error('Your gallery or backups changed. Review the current list before deleting.');
  }
  const paths = fresh.backups.map(file => file.path);
  for (let index = 0; index < paths.length; index += 100) check(await client.storage.from('photos').remove(paths.slice(index, index + 100)));
  const remaining = new Set((await storageObjects(client)).map(file => file.name));
  if (paths.some(path => remaining.has(path))) throw new Error('Some backup files remain. Review storage again to finish the cleanup.');
  // Refresh metadata after deletion so concurrent caption edits are preserved.
  // Revision checks protect against an update racing this final save.
  const removed = new Set(fresh.references);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = check(await client.rpc('read_photo_admin'));
    const active = current.photos.flatMap(photo => [photo.storage_path, photo.preview_path]);
    if (active.some(path => removed.has(path))) throw new Error('The gallery changed during cleanup. Refresh the studio before making further changes.');
    if (!current.photos.some(photo => removed.has(photo.source_path))) return { count: paths.length, bytes: fresh.bytes };
    const photo_rows = current.photos.map(photo => removed.has(photo.source_path) ? { ...photo, source_path: null } : photo);
    const { layout, columns, hero_id, revision } = current.settings;
    const result = await client.rpc('save_photo_gallery', { photo_rows, gallery_settings: { layout, columns, hero_id }, expected_revision: revision });
    if (!result.error) return { count: paths.length, bytes: fresh.bytes };
    if (!result.error.message?.includes('another session')) throw new Error('The backup files were removed, but their references could not be cleared. Review storage again to finish.');
  }
  throw new Error('The backup files were removed, but the gallery is being edited elsewhere. Review storage again to clear the old references.');
}
