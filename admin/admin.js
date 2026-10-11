import { getClient, check, photoURLs, arrange, validatePhoto, imageStyle } from '../lib/photos.js?v=20261011-30mb';
import { invokeAI, photoPreview, suggestBatch } from './ai.js?v=20261011-batch';

const $ = selector => document.querySelector(selector);
const status = (message = '', error = false) => { $('#status').textContent = message; $('#status').dataset.error = error; };
let client, photos = [], settings, snapshot, dirty = false, busy = false, pendingUploads = new Set(), cleanupQueue = new Set();
let aiReady = false;
let stopBatch = false;
const suggestions = new Map();
const shapeNames = { portrait: 'Portrait · 4:5', landscape: 'Landscape · 3:2', square: 'Square · 1:1', original: 'Original proportions' };
const serializable = () => photos.map(({ url, ...photo }, sort_order) => ({ ...photo, sort_order }));
function changed() { dirty = true; $('#save').disabled = busy; $('#discard').disabled = busy; }
function lock(value) {
  busy = value;
  $('#workspace').inert = value;
  $('#logout').disabled = value;
  $('#save').disabled = value || !dirty;
  $('#discard').disabled = value || !dirty;
  renderBatchControls();
}
function batchPhotos() {
  return photos.filter(photo => !suggestions.has(photo.id) && ($('#ai-scope').value !== 'new' || pendingUploads.has(photo.storage_path)));
}
function renderBatchControls() {
  const newUploads = photos.some(photo => pendingUploads.has(photo.storage_path));
  $('#ai-scope option[value="new"]').disabled = !newUploads;
  if (!newUploads) $('#ai-scope').value = 'all';
  const count = batchPhotos().length;
  $('#ai-batch').disabled = busy || !aiReady || !count;
  $('#ai-batch-count').textContent = `${count} photo${count === 1 ? '' : 's'} to suggest · existing drafts are skipped`;
  $('#ai-apply-all').hidden = !suggestions.size;
  $('#ai-apply-all').disabled = busy;
  $('#ai-apply-all').textContent = `Use all ${suggestions.size} draft${suggestions.size === 1 ? '' : 's'}`;
}
async function cleanFiles(paths) {
  if (!paths.length) return;
  check(await client.storage.from('photos').remove(paths));
  paths.forEach(path => { pendingUploads.delete(path); cleanupQueue.delete(path); });
}
async function load() {
  const data = check(await client.rpc('read_photo_admin'));
  const resolved = await photoURLs(data.photos, client);
  photos = resolved; settings = data.settings; suggestions.clear();
  snapshot = structuredClone({ photos, settings }); dirty = false;
  $('#login').hidden = true; $('#workspace').hidden = false; $('#logout').hidden = false; $('#counts').hidden = false;
  render();
  void checkAIConnection();
}
async function checkAIConnection() {
  $('#ai-status').textContent = 'Checking AI connection…';
  try {
    const data = await invokeAI(client, { action: 'status' }); aiReady = data.configured === true;
    $('#ai-status').textContent = aiReady ? 'Ready when you are.' : 'AI suggestions need their secure connection set up.';
  } catch { aiReady = false; $('#ai-status').textContent = 'AI suggestions are not connected yet. You can still edit every photo yourself.'; }
  $('#photo-list').querySelectorAll('[data-action="suggest"]').forEach(button => { button.disabled = !aiReady; });
  renderBatchControls();
}
function renderSuggestion(card, photo) {
  const suggestion = suggestions.get(photo.id);
  const preview = card.querySelector('.ai-suggestion');
  preview.hidden = !suggestion;
  if (!suggestion) return;
  const heading = document.createElement('h3'); heading.textContent = 'A draft for your photo'; preview.append(heading);
  const list = document.createElement('dl');
  for (const [label, value] of [['Title', suggestion.title], ['Accessibility description', suggestion.alt], ['Caption', suggestion.caption], ['Display shape', shapeNames[suggestion.aspect]]]) {
    const term = document.createElement('dt'), detail = document.createElement('dd'); term.textContent = label; detail.textContent = value; list.append(term, detail);
  }
  preview.append(list);
  const reason = document.createElement('p'); reason.textContent = suggestion.reason; preview.append(reason);
  const actions = document.createElement('div'); actions.className = 'ai-review-actions';
  const apply = document.createElement('button'); apply.className = 'button dark'; apply.textContent = 'Use these suggestions';
  apply.onclick = () => {
    for (const field of ['title', 'alt', 'caption', 'aspect']) photo[field] = suggestion[field];
    suggestions.delete(photo.id); changed(); render(); status('Suggestions applied to your draft. Edit anything you like, then save to publish.');
    $('#photo-list').children[photos.findIndex(p => p.id === photo.id)].querySelector('[data-field="title"]').focus();
  };
  const dismiss = document.createElement('button'); dismiss.className = 'plain-button'; dismiss.textContent = 'Keep my details';
  dismiss.onclick = () => { suggestions.delete(photo.id); render(); };
  actions.append(apply, dismiss); preview.append(actions);
}
async function suggestPhoto(photo) {
  lock(true); status(`Looking at “${photo.title}”…`);
  try {
    await draftPhoto(photo, $('#ai-notes').value.trim());
    status('Your AI draft is ready. Review it below before using the suggestions.');
  } catch (error) { status(error.message, true); }
  finally {
    lock(false); render();
    const card = $('#photo-list').children[photos.findIndex(p => p.id === photo.id)];
    const preview = card?.querySelector('.ai-suggestion');
    if (preview && !preview.hidden) { preview.focus(); preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
}
async function draftPhoto(photo, notes) {
  const preview = await photoPreview(photo.url);
  const data = await invokeAI(client, { action: 'suggest', ...preview, notes });
  suggestions.set(photo.id, data.suggestion);
}
$('#ai-scope').onchange = renderBatchControls;
$('#ai-stop').onclick = () => {
  stopBatch = true; $('#ai-stop').disabled = true;
  $('#ai-progress-text').textContent = 'Stopping after the current photo. Completed drafts will stay here.';
};
$('#ai-batch').onclick = async () => {
  const queue = batchPhotos();
  if (busy || !aiReady || !queue.length) return;
  const notes = $('#ai-notes').value.trim();
  stopBatch = false; lock(true);
  $('#ai-progress').hidden = false; $('#ai-stop').disabled = false;
  $('#ai-progress-bar').max = queue.length; $('#ai-progress-bar').value = 0;
  status('Writing AI drafts for your batch. You can stop after the current photo.');
  try {
    const result = await suggestBatch(queue, {
      shouldStop: () => stopBatch,
      onProgress: (photo, index, total) => { $('#ai-progress-text').textContent = `Photo ${index} of ${total}: ${photo.title}`; },
      suggest: async photo => { await draftPhoto(photo, notes); $('#ai-progress-bar').value++; }
    });
    const ready = `${result.completed} of ${queue.length} drafts ready.`;
    status(result.error ? `${ready} Batch paused: ${result.error.message} Completed drafts are kept; run the batch again to continue.` : `${ready} ${result.stopped ? 'Batch stopped. ' : ''}Review the drafts below or use them all, then save to publish.`, Boolean(result.error));
  } finally {
    $('#ai-progress').hidden = true; lock(false); render();
    $('#ai-apply-all').hidden ? $('#ai-batch').focus() : $('#ai-apply-all').focus();
  }
};
$('#ai-apply-all').onclick = () => {
  let applied = 0;
  for (const photo of photos) {
    const suggestion = suggestions.get(photo.id);
    if (!suggestion) continue;
    for (const field of ['title', 'alt', 'caption', 'aspect']) photo[field] = suggestion[field];
    applied++;
  }
  if (!applied) return;
  suggestions.clear(); changed(); render();
  status(`${applied} AI drafts applied. Edit anything you like, then save to publish.`);
};
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
    const aiActions = document.createElement('div'); aiActions.className = 'photo-ai-actions';
    const suggest = document.createElement('button'); suggest.dataset.action = 'suggest'; suggest.className = 'ai-button'; suggest.textContent = '✦ Suggest with AI'; suggest.disabled = !aiReady;
    suggest.onclick = () => suggestPhoto(photo);
    aiActions.append(suggest); card.querySelector('.edit-fields').prepend(aiActions);
    const aiPreview = document.createElement('section'); aiPreview.className = 'ai-suggestion'; aiPreview.tabIndex = -1; aiPreview.setAttribute('aria-label', 'AI suggestions');
    aiActions.after(aiPreview); renderSuggestion(card, photo);
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
      dialog.addEventListener('close', () => { if (dialog.returnValue === 'delete') { photos = photos.filter(p => p.id !== photo.id); suggestions.delete(photo.id); changed(); render(); } }, { once: true });
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
    status(`${added} photo${added === 1 ? '' : 's'} added. Use “Suggest for batch” for your new uploads, or edit the details yourself, then save to publish.`);
  } catch (error) { status(`${added ? `${added} uploaded. ` : ''}${error.message}`, true); }
  finally { event.target.value = ''; if (added) $('#ai-scope').value = 'new'; lock(false); render(); }
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
  try { await cleanFiles([...pendingUploads]); photos = structuredClone(snapshot.photos); settings = structuredClone(snapshot.settings); suggestions.clear(); dirty = false; status('Unsaved changes discarded.'); render(); }
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
      if (event === 'SIGNED_OUT') { $('#workspace').hidden = true; $('#logout').hidden = true; $('#login').hidden = false; $('#photo-list').replaceChildren(); photos = []; suggestions.clear(); aiReady = false; dirty = false; }
    });
    const { data } = await client.auth.getSession();
    if (recovering && data.session) { $('#recovery').hidden = false; status('Choose a new password.'); }
    else if (data.session) { await load(); status('Welcome back.'); }
    else { $('#login').hidden = false; status(''); }
  } catch (error) { if (client) $('#login').hidden = false; else $('#setup').hidden = false; status(`Could not open your studio: ${error.message}`, true); }
}
init();
