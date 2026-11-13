// Public read-only delivery. Never use a service-role key or a visitor's session.
const PHOTO_FIELDS = ['id', 'storage_path', 'preview_path', 'local_path', 'title', 'alt', 'caption', 'visible', 'homepage', 'aspect', 'focal_x', 'focal_y', 'sort_order', 'pixel_width', 'pixel_height'];
const SETTING_FIELDS = ['layout', 'columns', 'hero_id', 'revision'];
const pick = (value, fields) => Object.fromEntries(fields.filter(key => key in value).map(key => [key, value[key]]));
const FILE = /^[a-f0-9-]{36}\.(jpg|png|webp|avif)$/;
const LINK_SECONDS = 3600;
const RENEW_EARLY_MS = 5 * 60 * 1000;

export function createGalleryHandler(env, fetcher = fetch, now = Date.now) {
  // Only download links are reused, never the gallery or visibility decisions.
  const links = new Map();
  return async request => {
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Expose-Headers': 'Server-Timing', 'Allow': 'GET, OPTIONS'
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return reply({ error: 'Use GET.' }, 405);
    const query = new URL(request.url).searchParams;
    const view = query.get('view') || 'journal';
    if (!['home', 'journal'].includes(view)) return reply({ error: 'Unknown gallery view.' }, 400);
    try {
      const base = env.SUPABASE_URL?.replace(/\/$/, '');
      const publicKeys = [...Object.values(JSON.parse(env.SUPABASE_PUBLISHABLE_KEYS || '{}')), env.SUPABASE_ANON_KEY].filter(key => typeof key === 'string' && key);
      if (!base || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !publicKeys.length) throw new Error('setup');
      // Validate a project public key here instead of the gateway JWT check.
      // The query form allows the browser to make a single simple GET.
      const key = request.headers.get('apikey') || query.get('apikey');
      if (!key || !publicKeys.includes(key)) return reply({ error: 'A valid project publishable key is required.' }, 401);
      const call = async (path, body) => {
        const response = await fetcher(base + path, {
          method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error('upstream');
        return response.json();
      };
      const started = now();
      const data = await call('/rest/v1/rpc/read_photo_gallery', {});
      const readDone = now();
      if (!Array.isArray(data?.photos) || data.photos.length > 1000 || !data.settings || typeof data.settings !== 'object') throw new Error('gallery');
      const settings = pick(data.settings, SETTING_FIELDS);
      const photos = data.photos.filter(p => p?.visible === true && (view !== 'home' || p.homepage || p.id === settings.hero_id)).map(p => pick(p, PHOTO_FIELDS));
      const paths = [...new Set(photos.flatMap(p => [p.storage_path, p.preview_path]).filter(Boolean))];
      if (paths.some(path => typeof path !== 'string' || !FILE.test(path))) throw new Error('path');
      const usableAfter = now() + RENEW_EARLY_MS;
      for (const [path, link] of links) if (link.expiresAt <= usableAfter) links.delete(path);
      // Keep a request-local snapshot so concurrent cache eviction cannot
      // remove a link while this request is waiting for another batch.
      const resolved = new Map(paths.filter(path => links.has(path)).map(path => [path, links.get(path)]));
      const missing = paths.filter(path => !resolved.has(path));
      if (missing.length) {
        // Expiry begins before the signing call, so even a slow response is safe.
        const expiresAt = now() + LINK_SECONDS * 1000;
        const signed = await call('/storage/v1/object/sign/photos', { paths: missing, expiresIn: LINK_SECONDS });
        if (!Array.isArray(signed) || signed.length !== missing.length) throw new Error('signing');
        const additions = new Map();
        for (const item of signed) {
          if (item.error || !missing.includes(item.path) || additions.has(item.path)) throw new Error('signing');
          const raw = item.signedURL || item.signedUrl;
          if (typeof raw !== 'string') throw new Error('signing');
          const url = new URL(raw.startsWith('/object/') ? '/storage/v1' + raw : raw, base);
          if (url.origin !== base || url.pathname !== '/storage/v1/object/sign/photos/' + item.path || !url.searchParams.get('token')) throw new Error('signing');
          additions.set(item.path, { url: url.href, expiresAt });
        }
        for (const [path, link] of additions) { links.set(path, link); resolved.set(path, link); }
      }
      const output = photos.map(p => ({ ...p,
        url: p.storage_path ? resolved.get(p.storage_path).url : null,
        preview_url: p.preview_path ? resolved.get(p.preview_path).url : p.storage_path ? resolved.get(p.storage_path).url : null
      }));
      // Bound per-isolate memory even as photographs are replaced over time.
      while (links.size > 2000) links.delete(links.keys().next().value);
      headers['Server-Timing'] = `gallery;dur=${Math.max(0, readDone - started)}, signing;dur=${Math.max(0, now() - readDone)}`;
      return reply({ delivery: 'photo-gallery-v1', photos: output, settings });
    } catch {
      // Errors never include credentials, hidden rows, or upstream responses.
      return reply({ error: 'The photo gallery is temporarily unavailable.' }, 503);
    }
  };
}
