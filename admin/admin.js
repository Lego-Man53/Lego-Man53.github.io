import { getClient, check, photoURLs, arrange, validatePhoto, imageStyle } from '../lib/photos.js';

const $ = selector => document.querySelector(selector);
const status = (message = '', error = false) => { $('#status').textContent = message; $('#status').dataset.error = error; };
let client, photos = [], settings, snapshot, dirty = false, busy = false, pendingUploads = new Set(), cleanupQueue = new Set();
const serializable = () => photos.map(({ url, ...photo }, sort_order) => ({ ...photo, sort_order }));
function changed() { dirty = true; $('#save').disabled = busy; $('#discard').disabled = busy; }
function lock(value) {
  busy = value;
  $('#workspace').inert = value;
  $('#logout').disabled = value;
  $('#save').disabled = value || !dirty;
  $('#discard').disabled = value || !dirty;
}
async function cleanFiles(paths) {
  if (!paths.length) return;
  check(await client.storage.from('photos').remove(paths));
  paths.forEach(path => { pendingUploads.delete(path); cleanupQueue.delete(path); });
}
async function load() {
  const data = check(await client.rpc('read_photo_admin'));
  const resolved = await photoURLs(data.photos, client);
  photos = resolved; settings = data.settings;
  snapshot = structuredClone({ photos, settings }); dirty = false;
  $('#login').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false; $('#counts').hidden = false;
  render();
}
function renderOptions() {
  $('#layout').value = settings.layout; $('#columns').value = settings.columns;
  $('#hero').replaceChildren(new Option('No cover photo', ''));
  photos.filter(p => p.visible).forEach(p => $('#hero').append(new Option(p.title, p.id)));
  if (!photos.some(p => p.visible && p.id === settings.hero_id)) settings.hero_id = null;
  $('#hero').value = settings.hero_id || '';
  $('#counts').textContent = `${photos.length} photographs · ${photos.filter(p => p.visible).length} visible`;
}
function render() {
  renderOptions();
  $('#photo-list').replaceChildren();
  $('#empty').hidden = photos.length > 0;
  photos.forEach((photo, index) => {
    const card = document.createElement('article'); card.className = 'edit-card';
    card.innerHTML = '<div class="edit-preview"><img alt=""><span class="photo-state"></span></div><div class="edit-fields"><label>Title<input data-field="title" maxlength="160" required></label><label>Description for accessibility<input data-field="alt" maxlength="500" required></label><label>Caption<textarea data-field="caption" maxlength="2000" rows="2"></textarea></label><div class="check-row"><label><input data-field="visible" type="checkbox">Visible</label><label><input data-field="homepage" type="checkbox">On homepage</label></div><label>Display shape<select data-field="aspect"><option value="portrait">Portrait</option><option value="landscape">Landscape</option><option value="square">Square</option><option value="original">Original proportions</option></select></label><div class="field-pair"><label class="focal-control">Crop: left ↔ right<input data-field="focal_x" type="range" min="0" max="100"></label><label class="focal-control">Crop: top ↔ bottom<input data-field="focal_y" type="range" min="0" max="100"></label></div><div class="card-actions"><div><button data-action="up" aria-label="Move photo earlier">↑</button> <button data-action="down" aria-label="Move photo later">↓</button></div><button data-action="delete" class="danger">Delete</button></div></div>';
    const image = card.querySelector('img'); image.src = photo.url; image.alt = photo.alt; image.style.objectPosition = imageStyle(photo);
    const badge = card.querySelector('.photo-state'); badge.textContent = photo.visible ? 'VISIBLE' : 'HIDDEN';
    card.querySelectorAll('[data-field]').forEach(input => {
      const field = input.dataset.field;
      if (input.type === 'checkbox') input.checked = photo[field]; else input.value = photo[field];
      input.addEventListener('input', () => {
        photo[field] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
        changed();
        badge.textContent = photo.visible ? 'VISIBLE' : 'HIDDEN';
        image.style.objectPosition = imageStyle(photo); image.alt = photo.alt;
        if (field === 'visible' || field === 'title') renderOptions();
      });
    });
    card.querySelector('[data-action="up"]').disabled = index === 0;
    card.querySelector('[data-action="down"]').disabled = index === photos.length - 1;
    ['up', 'down'].forEach(action => card.querySelector(`[data-action="${action}"]`).onclick = () => {
      photos = arrange(photos, photo.id, action === 'up' ? -1 : 1); changed(); render();
      $('#photo-list').children[photos.findIndex(p => p.id === photo.id)].querySelector(`[data-action="${action}"]`).focus();
    });
    card.querySelector('[data-action="delete"]').onclick = () => {
      $('#delete-name').textContent = photo.title;
      const dialog = $('#delete-dialog'); dialog.returnValue = '';
      dialog.addEventListener('close', () => { if (dialog.returnValue === 'delete') { photos = photos.filter(p => p.id !== photo.id); changed(); render(); } }, { once: true });
      dialog.showModal();
    };
    $('#photo-list').append(card);
  });
  lock(busy);
}
$('#layout').onchange = event => { settings.layout = event.target.value; changed(); };
$('#columns').onchange = event => { settings.columns = Number(event.target.value); changed(); };
$('#hero').onchange = event => { settings.hero_id = event.target.value || null; changed(); };
$('#upload').onclick = () => $('#files').click();
$('#files').onchange = async event => {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  lock(true);
  let added = 0;
  try {
    files.forEach(validatePhoto);
    for (const file of files) {
      status(`Uploading ${added + 1} of ${files.length}: ${file.name}`);
      const bitmap = await createImageBitmap(file); const aspect = bitmap.width > bitmap.height ? 'landscape' : 'portrait'; bitmap.close();
      const id = crypto.randomUUID(); const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[file.type];
      const path = `${id}.${extension}`;
      check(await client.storage.from('photos').upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false }));
      pendingUploads.add(path);
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim().slice(0, 160) || 'Untitled photograph';
      const photo = { id, storage_path: path, local_path: null, title: name, alt: name, caption: '', visible: true, homepage: false, aspect, focal_x: 50, focal_y: 50, sort_order: photos.length };
      let resolved;
      try { [resolved] = await photoURLs([photo], client); } catch (error) { await cleanFiles([path]); throw error; }
      photos.push(resolved); added++; changed();
    }
    status(`${added} photo${added === 1 ? '' : 's'} added. Edit the details, then save to publish.`);
  } catch (error) { status(`${added ? `${added} uploaded. ` : ''}${error.message}`, true); }
  finally { event.target.value = ''; lock(false); render(); }
};
$('#save').onclick = async () => {
  if (!$('#workspace').querySelectorAll('input:invalid,textarea:invalid').length) {
    if (photos.some(p => !p.title.trim() || !p.alt.trim())) return status('Give every photograph a title and an accessibility description.', true);
  } else { $('#workspace').querySelector(':invalid').reportValidity(); return; }
  lock(true); status('Saving your photo journal…');
  let saved = false;
  try {
    const data = check(await client.rpc('save_photo_gallery', { photo_rows: serializable(), gallery_settings: { layout: settings.layout, columns: settings.columns, hero_id: settings.hero_id }, expected_revision: snapshot.settings.revision }));
    saved = true;
    const live = new Set(photos.map(p => p.storage_path).filter(Boolean));
    const removed = [...new Set([...snapshot.photos.map(p => p.storage_path).filter(Boolean), ...pendingUploads, ...cleanupQueue])].filter(path => !live.has(path));
    removed.forEach(path => cleanupQueue.add(path));
    live.forEach(path => pendingUploads.delete(path));
    settings.revision = data.revision; snapshot = structuredClone({ photos, settings }); dirty = false;
    await cleanFiles(removed);
    status('Saved. Your website is up to date.');
  } catch (error) {
    const conflict = error.message?.includes('another session');
    status(saved ? 'Your changes are published. An unused file could not be cleaned up; try saving again.' : conflict ? 'Another session saved newer changes. Copy any edits you want to keep, then reload before saving.' : `Could not save: ${error.message}. Your edits are still here.`, true);
    if (saved) { dirty = true; changed(); }
  } finally { lock(false); renderOptions(); }
};
$('#discard').onclick = async () => {
  lock(true);
  try { await cleanFiles([...pendingUploads]); photos = structuredClone(snapshot.photos); settings = structuredClone(snapshot.settings); dirty = false; status('Unsaved changes discarded.'); render(); }
  catch (error) { status(`Could not discard uploaded files: ${error.message}`, true); }
  finally { lock(false); }
};
$('#login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; status('Logging in…');
  const form = new FormData(event.target);
  try { check(await client.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') })); await load(); event.target.reset(); status('Welcome back.'); }
  catch (error) { await client.auth.signOut({ scope: 'local' }).catch(() => {}); status('Login failed. Check your email and password, and make sure this account has admin access.', true); }
  finally { button.disabled = false; }
};
$('#logout').onclick = async () => {
  if (dirty && !window.confirm('Discard your unsaved changes and log out?')) return;
  lock(true);
  try { await cleanFiles([...pendingUploads]); check(await client.auth.signOut({ scope: 'local' })); location.reload(); }
  catch (error) { status(`Could not log out: ${error.message}`, true); lock(false); }
};
$('#forgot').onclick = async () => {
  const input = $('#login-form input[type="email"]'); if (!input.reportValidity()) return;
  $('#forgot').disabled = true;
  try { check(await client.auth.resetPasswordForEmail(input.value, { redirectTo: new URL('./', location.href).href })); status('If that account exists, a password reset link is on its way.'); }
  catch (error) { status(error.message, true); }
  finally { $('#forgot').disabled = false; }
};
$('#password-form').onsubmit = async event => {
  event.preventDefault(); event.submitter.disabled = true;
  try { check(await client.auth.updateUser({ password: new FormData(event.target).get('password') })); $('#recovery').hidden = true; await load(); event.target.reset(); status('Password updated.'); }
  catch (error) { status(error.message, true); }
  finally { event.submitter.disabled = false; }
};
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
async function init() {
  try {
    const recovering = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
    client = getClient();
    if (!client) { $('#setup').hidden = false; status('Photo storage has not been connected yet.'); return; }
    client.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') { $('#login').hidden = true; $('#workspace').hidden = true; $('#recovery').hidden = false; status('Choose a new password.'); }
      if (event === 'SIGNED_OUT') { $('#workspace').hidden = true; $('#logout').hidden = true; $('#login').hidden = false; $('#photo-list').replaceChildren(); photos = []; dirty = false; }
    });
    const { data } = await client.auth.getSession();
    if (recovering && data.session) { $('#recovery').hidden = false; status('Choose a new password.'); }
    else if (data.session) { await load(); status('Welcome back.'); }
    else { $('#login').hidden = false; status(''); }
  } catch (error) { if (client) $('#login').hidden = false; else $('#setup').hidden = false; status(`Could not open your studio: ${error.message}`, true); }
}
init();
