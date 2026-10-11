import { publicGallery, imageStyle } from './lib/photos.js';

const dialog = document.createElement('dialog');
dialog.className = 'photo-viewer';
dialog.innerHTML = '<button class="viewer-close" aria-label="Close photograph">Close ×</button><div class="viewer-body"><img alt=""><div class="viewer-caption"><h2></h2><p></p></div></div><div class="viewer-controls"><button aria-label="Previous photograph">← Previous</button><span aria-live="polite"></span><button aria-label="Next photograph">Next →</button></div>';
document.body.append(dialog);
let viewing = [], current = 0, opener;
function show(index) {
  current = (index + viewing.length) % viewing.length;
  const photo = viewing[current];
  dialog.querySelector('img').src = photo.url;
  dialog.querySelector('img').alt = photo.alt || photo.title;
  dialog.querySelector('h2').textContent = photo.title;
  dialog.querySelector('p').textContent = photo.caption;
  dialog.querySelector('.viewer-controls span').textContent = `${current + 1} / ${viewing.length}`;
}
dialog.querySelector('.viewer-close').onclick = () => dialog.close();
const controls = dialog.querySelectorAll('.viewer-controls button');
controls[0].onclick = () => show(current - 1);
controls[1].onclick = () => show(current + 1);
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') show(current - 1);
  if (event.key === 'ArrowRight') show(current + 1);
});
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { document.body.style.overflow = ''; opener?.focus(); });

export function renderPhotos(container, photos, settings, homepage = false) {
  container.replaceChildren();
  container.dataset.layout = settings.layout;
  container.dataset.columns = settings.columns;
  container.style.setProperty('--columns', settings.columns);
  photos.forEach((photo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `photo-item ${photo.aspect === 'landscape' ? 'landscape' : ''}`;
    button.dataset.aspect = photo.aspect;
    button.setAttribute('aria-label', `View ${photo.title}`);
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.alt || photo.title;
    img.loading = 'lazy';
    img.style.objectPosition = imageStyle(photo);
    const label = document.createElement('span');
    label.textContent = `${String(index + 1).padStart(2, '0')} / ${photo.title.toUpperCase()}`;
    const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); label.append(arrow);
    button.append(img, label);
    if (!homepage && photo.caption) { const caption = document.createElement('p'); caption.className = 'journal-caption'; caption.textContent = photo.caption; button.append(caption); }
    button.onclick = () => { viewing = photos; opener = button; show(index); dialog.showModal(); document.body.style.overflow = 'hidden'; };
    container.append(button);
  });
}

async function load() {
  const journal = document.querySelector('#journal-grid');
  const home = document.querySelector('#home-photos');
  const status = document.querySelector('#gallery-status');
  try {
    const { photos, settings } = await publicGallery(journal ? '../' : './');
    if (journal) {
      renderPhotos(journal, photos, settings);
      status.textContent = photos.length ? '' : 'New photographs are on their way.';
    }
    if (home) {
      renderPhotos(home, photos.filter(p => p.homepage), settings, true);
      const hero = photos.find(p => p.id === settings.hero_id);
      const figure = document.querySelector('.hero-photo');
      figure.hidden = !hero;
      if (hero) { const img = figure.querySelector('img'); img.src = hero.url; img.alt = hero.alt || hero.title; img.style.objectPosition = imageStyle(hero); }
    }
  } catch (error) {
    if (status) status.textContent = 'The photo journal is temporarily unavailable. Please try again shortly.';
    // A configured service never falls back to old photos: hidden or deleted photos stay hidden.
    if (home) { home.replaceChildren(); const note = document.createElement('p'); note.textContent = 'Photographs are temporarily unavailable.'; home.append(note); document.querySelector('.hero-photo').hidden = true; }
  }
}
load();
// Signed image links expire after an hour. Refresh them in long-lived tabs.
setInterval(() => { if (!document.hidden && !dialog.open) load(); }, 45 * 60 * 1000);
