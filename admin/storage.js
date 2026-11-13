import { getClient } from '../lib/photos.js?v=20261113-speed';
import { reviewBackups, removeReviewedBackups } from '../lib/backups.js?v=20261113-cleanup';
const $ = selector => document.querySelector(selector);
const size = bytes => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
let client, reviewed, busy = false;
function status(message, error = false) { $('#status').textContent = message; $('#status').dataset.error = error; }
async function review() {
  $('#remove').disabled = true; $('#refresh').disabled = true;
  status('Checking backup files and compressed copies…');
  try {
    reviewed = await reviewBackups(client);
    $('#review').hidden = false;
    $('#summary').textContent = `${reviewed.backups.length} original backup${reviewed.backups.length === 1 ? '' : 's'} · ${size(reviewed.bytes)}`;
    $('#details').textContent = `Your gallery contains ${reviewed.photoCount} photographs. Every backup listed below has a verified website image and thumbnail.`;
    $('#files').replaceChildren();
    for (const file of reviewed.backups) {
      const row = document.createElement('li'), label = document.createElement('strong'), bytes = document.createElement('span');
      label.textContent = file.title; bytes.textContent = size(file.bytes); row.append(label, bytes); $('#files').append(row);
    }
    $('#remove').disabled = !reviewed.references.length;
    status(reviewed.backups.length ? 'Ready to review. No files have been deleted.' : reviewed.references.length ? 'Original files are already removed. Finish cleanup to clear their old references.' : 'No original backups remain. Your compressed photos and thumbnails are stored.');
  } catch (error) { status(error.message, true); }
  finally { $('#refresh').disabled = false; }
}
$('#refresh').onclick = review;
$('#remove').onclick = () => {
  if (!reviewed || busy) return;
  $('#confirm-details').textContent = `Delete ${reviewed.backups.length} original backups and free ${size(reviewed.bytes)}?`;
  $('#confirmation').returnValue = '';
  $('#confirmation').showModal();
};
$('#confirmation').addEventListener('close', async () => {
  if ($('#confirmation').returnValue !== 'delete' || busy) return;
  busy = true; $('#remove').disabled = $('#refresh').disabled = true;
  status('Removing original backups…');
  try {
    const result = await removeReviewedBackups(client, reviewed);
    await review();
    status(`Removed ${result.count} original backups and freed ${size(result.bytes)}. Your compressed photos, thumbnails, and captions are kept.`);
  } catch (error) { status(error.message, true); $('#refresh').disabled = false; }
  finally { busy = false; }
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
try {
  client = getClient();
  if (!client || !(await client.auth.getSession()).data.session) {
    status('Log in through the photo studio, then return to storage cleanup in this tab.'); $('#login').hidden = false;
  } else await review();
} catch (error) { status(error.message, true); $('#login').hidden = false; }
