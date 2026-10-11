export async function invokeAI(client, body) {
  const result = await client.functions.invoke('photo-assist', { body });
  if (result.error) {
    let message = 'AI suggestions could not connect. Try again after the AI connection is set up.';
    if (result.error.context instanceof Response) {
      try { const data = await result.error.context.json(); if (typeof data.error === 'string') message = data.error; } catch {}
    }
    throw new Error(message);
  }
  return result.data;
}
// Keep paid requests sequential. Stop at the first error so a quota or connection
// problem cannot turn into a paid retry loop; completed drafts remain available.
export async function suggestBatch(photos, { suggest, shouldStop, onProgress }) {
  let completed = 0;
  for (const photo of photos) {
    if (shouldStop()) return { completed, stopped: true };
    onProgress(photo, completed + 1, photos.length);
    try { await suggest(photo); completed++; }
    catch (error) { return { completed, error }; }
  }
  return { completed, stopped: shouldStop() };
}
export async function photoPreview(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The photo could not load for AI. Refresh your studio and try again.');
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    // Re-encoding sends just visible pixels, with a white backdrop for transparent photos.
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
    let image = canvas.toDataURL('image/jpeg', .82);
    if (image.length > 1500000) image = canvas.toDataURL('image/jpeg', .6);
    if (image.length > 1500000) throw new Error('This photo preview is too large for AI. You can still edit it yourself.');
    return { image, width, height };
  } finally { bitmap.close(); }
}
