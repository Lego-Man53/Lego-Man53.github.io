import assert from 'node:assert/strict';
import { createGalleryHandler } from '../supabase/functions/photo-gallery/handler.js';

const base = 'https://test.supabase.co';
const file = number => `${String(number).padStart(8, '0')}-0000-4000-8000-000000000000.webp`;
const row = (id, extra = {}) => ({ id: String(id), storage_path: file(id), preview_path: file(id + 100), title: `Photo ${id}`, caption: `Caption ${id}`, visible: true, homepage: false, ...extra });
let rows = [row(1), row(2, { homepage: true }), row(3), row(4, { visible: false, source_path: file(400) })];
let settings = { hero_id: '1', columns: 3, layout: 'grid', revision: 1 };
let clock = 1000000, reads = 0, signedBatches = [], failRead = false, badSign = false;
const upstream = async (url, options) => {
  assert.equal(options.headers.apikey, 'anonymous-key');
  assert.equal(options.headers.Authorization, undefined, 'Visitor admin sessions are never forwarded');
  assert.ok(!JSON.stringify(options).includes('service-secret'));
  if (url.endsWith('/rpc/read_photo_gallery')) {
    reads++;
    assert.deepEqual(JSON.parse(options.body), {});
    return failRead ? new Response('Internal private detail', { status: 500 }) : Response.json({ photos: rows, settings });
  }
  assert.equal(url, base + '/storage/v1/object/sign/photos');
  const body = JSON.parse(options.body);
  assert.equal(body.expiresIn, 3600);
  signedBatches.push(body.paths);
  return Response.json(body.paths.map(path => badSign ? { path, error: 'Private detail' } : { path, signedURL: `/object/sign/photos/${path}?token=link-${clock}` }));
};
const handler = createGalleryHandler({ SUPABASE_URL: base, SUPABASE_ANON_KEY: 'anonymous-key', SUPABASE_SERVICE_ROLE_KEY: 'service-secret' }, upstream, () => clock);
const get = (view = 'home', extra = {}) => handler(new Request(`${base}/functions/v1/photo-gallery?view=${view}&apikey=anonymous-key`, extra));

let response = await get('home', { headers: { Authorization: 'Bearer admin-session', Origin: 'https://yusufmm.com' } });
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'no-store');
assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
let gallery = await response.json();
assert.equal(gallery.delivery, 'photo-gallery-v1');
assert.deepEqual(gallery.photos.map(p => p.id), ['1', '2']);
assert.deepEqual(signedBatches[0], [file(1), file(101), file(2), file(102)]);
assert.ok(gallery.photos.every(p => p.url.startsWith(base + '/storage/v1/object/sign/photos/') && p.preview_url));
assert.ok(!JSON.stringify(gallery).includes('source_path'));

response = await get();
assert.equal(response.status, 200);
assert.equal(reads, 2, 'Every visitor gets a fresh visibility read');
assert.equal(signedBatches.length, 1, 'A warm function reuses valid links');

rows = [row(1, { visible: false }), row(2, { homepage: true, caption: 'Updated caption' }), row(3)];
settings = { ...settings, hero_id: null, revision: 2 };
gallery = await (await get()).json();
assert.deepEqual(gallery.photos.map(p => p.id), ['2'], 'Hiding the cover takes effect even with warm link caches');
assert.equal(gallery.photos[0].caption, 'Updated caption', 'Captions are never cached');
assert.equal(signedBatches.length, 1);

gallery = await (await get('journal')).json();
assert.deepEqual(gallery.photos.map(p => p.id), ['2', '3']);
assert.deepEqual(signedBatches[1], [file(3), file(103)], 'Only missing public links are signed');
clock += 56 * 60 * 1000;
assert.equal((await get('journal')).status, 200);
assert.deepEqual(signedBatches[2], [file(2), file(102), file(3), file(103)], 'Links renew before expiration');

rows = [];
gallery = await (await get()).json();
assert.deepEqual(gallery.photos, [], 'An empty gallery never reuses old rows');
failRead = true;
response = await get();
assert.equal(response.status, 503);
assert.ok(!(await response.text()).includes('private detail'), 'Upstream errors stay private');
failRead = false;
rows = [row(10, { homepage: true })]; badSign = true;
assert.equal((await get()).status, 503, 'Partial signing failures fail closed');
badSign = false;
rows = [row(10, { homepage: true, preview_path: '../secret.jpg' })];
assert.equal((await get()).status, 503, 'Unexpected object paths cannot be signed');
rows = [{ id: 'local', visible: true, homepage: true, storage_path: null, preview_path: null, local_path: 'assets/photo-1.jpg' }];
gallery = await (await get()).json();
assert.equal(gallery.photos[0].url, null, 'Local assets remain supported');
const before = reads;
assert.equal((await get('unknown')).status, 400);
assert.equal((await get('home', { method: 'POST', body: JSON.stringify({ paths: ['private.jpg'] }) })).status, 405);
assert.equal((await get('home', { method: 'OPTIONS' })).status, 204);
assert.equal(reads, before, 'Invalid requests do not reach the database');
assert.equal((await handler(new Request(base))).status, 401, 'The handler validates a project public API key');
assert.equal((await handler(new Request(base + '?apikey=service-secret'))).status, 401, 'Privileged keys are not accepted');
assert.equal(reads, before, 'Invalid API keys cannot reach the database');
const missingKey = createGalleryHandler({ SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'service-secret' }, upstream);
assert.equal((await missingKey(new Request(base))).status, 503, 'Service-role keys cannot substitute for anonymous access');

console.log('Single-request delivery, anonymous isolation, fresh visibility/captions, warm link reuse/renewal, private sources, and fail-closed behavior passed.');
