(() => {
  const slug = value => String(value || '').toLowerCase().replace(/\s+/g, '-');
  let lockedScrollY = 0;
  const lockPage = () => {
    if (document.body.classList.contains('gallery-open')) return;
    lockedScrollY = window.scrollY;
    document.documentElement.classList.add('gallery-open');
    document.body.classList.add('gallery-open');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.width = '100%';
  };
  const unlockPage = () => {
    if (!document.body.classList.contains('gallery-open')) return;
    document.documentElement.classList.remove('gallery-open');
    document.body.classList.remove('gallery-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, lockedScrollY);
  };
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
    lockPage();
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
  const dialog = document.getElementById('gallery-dialog');
  dialog?.addEventListener('close', unlockPage);
  dialog?.addEventListener('cancel', unlockPage);
  document.querySelector('#gallery-dialog .close')?.addEventListener('click', () => { if (dialog?.close) dialog.close(); else { dialog?.removeAttribute('open'); unlockPage(); } });
  window.openProjectGallery = open;
})();
