(() => {
  const slug = value => String(value || '').toLowerCase().replace(/\s+/g, '-');
  const open = locationName => {
    const key = slug(locationName), details = window.GCGW_GALLERY_MEDIA?.[key] || {}, dialog = document.getElementById('gallery-dialog');
    if (!dialog) return;
    const media = [
      ...Array.from({ length: details.photos || 0 }, (_, index) => `<img src="gallery/${key}/${key}-photo-${String(index + 1).padStart(2, '0')}.jpeg" alt="${locationName} project photo ${index + 1}" loading="lazy">`),
      ...Array.from({ length: details.videos || 0 }, (_, index) => `<video controls preload="metadata" src="gallery/${key}/${key}-video-${String(index + 1).padStart(2, '0')}.mp4" aria-label="${locationName} project video ${index + 1}"></video>`)
    ];
    document.getElementById('gallery-title').textContent = locationName;
    document.getElementById('gallery-intro').textContent = media.length ? `${media.length} photos and videos from our work in ${locationName}.` : `Photos and videos from our work in ${locationName} will be added here soon.`;
    document.getElementById('gallery-grid').innerHTML = media.join('');
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  };
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-gallery]');
    if (!trigger) return;
    const card = trigger.closest('.location-card');
    const locationName = card?.querySelector('h3')?.textContent?.trim();
    if (!locationName) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(locationName);
  });
  document.querySelector('#gallery-dialog .close')?.addEventListener('click', () => { const dialog = document.getElementById('gallery-dialog'); if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); });
  window.openProjectGallery = open;
})();
