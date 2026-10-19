(() => {
  const slug = value => String(value || '').toLowerCase().replace(/\s+/g, '-');
  let lockedScrollY = 0;
  let galleryMedia = [];
  let activeIndex = 0;
  const dialog = document.getElementById('gallery-dialog');
  const viewer = document.getElementById('gallery-viewer');
  const viewerMedia = document.getElementById('gallery-viewer-media');
  const viewerCount = document.getElementById('gallery-viewer-count');
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
  const closeViewer = () => {
    if (!viewer) return;
    viewer.hidden = true;
    viewerMedia.replaceChildren();
  };
  const showViewer = index => {
    if (!viewer || !galleryMedia.length) return;
    activeIndex = (index + galleryMedia.length) % galleryMedia.length;
    const item = galleryMedia[activeIndex];
    viewerMedia.innerHTML = item.type === 'video'
      ? `<video controls autoplay playsinline src="${item.src}" aria-label="${item.alt}"></video>`
      : `<img src="${item.src}" alt="${item.alt}">`;
    viewerCount.textContent = `${activeIndex + 1} / ${galleryMedia.length}`;
    viewer.hidden = false;
    viewer.querySelector('.gallery-viewer-close')?.focus();
  };
  const renderThumb = (item, index) => `<button type="button" class="gallery-thumb" data-gallery-media-index="${index}" aria-label="Open ${item.alt}">
    ${item.type === 'video' ? `<video preload="metadata" muted playsinline src="${item.src}" aria-hidden="true"></video><span class="gallery-play" aria-hidden="true">▶</span>` : `<img src="${item.src}" alt="${item.alt}" loading="lazy">`}
  </button>`;
  const open = locationName => {
    const key = slug(locationName), details = window.GCGW_GALLERY_MEDIA?.[key] || {};
    if (!dialog) return;
    galleryMedia = [
      ...Array.from({ length: details.photos || 0 }, (_, index) => ({ type: 'image', src: `gallery/${key}/${key}-photo-${String(index + 1).padStart(2, '0')}.jpeg`, alt: `${locationName} project photo ${index + 1}` })),
      ...Array.from({ length: details.videos || 0 }, (_, index) => ({ type: 'video', src: `gallery/${key}/${key}-video-${String(index + 1).padStart(2, '0')}.mp4`, alt: `${locationName} project video ${index + 1}` }))
    ];
    document.getElementById('gallery-title').textContent = locationName;
    document.getElementById('gallery-intro').textContent = galleryMedia.length ? `Tap a photo or video to view it full size. ${galleryMedia.length} items from our work in ${locationName}.` : `Photos and videos from our work in ${locationName} will be added here soon.`;
    document.getElementById('gallery-grid').innerHTML = galleryMedia.map(renderThumb).join('');
    lockPage();
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  };
  document.addEventListener('click', event => {
    const thumb = event.target.closest('[data-gallery-media-index]');
    if (thumb) { event.preventDefault(); showViewer(Number(thumb.dataset.galleryMediaIndex)); return; }
    const trigger = event.target.closest('[data-gallery]');
    if (!trigger) return;
    const card = trigger.closest('.location-card');
    const locationName = card?.querySelector('h3')?.textContent?.trim();
    if (!locationName) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(locationName);
  });
  dialog?.addEventListener('close', () => { closeViewer(); unlockPage(); });
  dialog?.addEventListener('cancel', () => { closeViewer(); unlockPage(); });
  document.querySelector('#gallery-dialog .close')?.addEventListener('click', () => { if (dialog?.close) dialog.close(); else { dialog?.removeAttribute('open'); closeViewer(); unlockPage(); } });
  viewer?.querySelector('.gallery-viewer-close')?.addEventListener('click', closeViewer);
  viewer?.querySelector('.gallery-viewer-prev')?.addEventListener('click', () => showViewer(activeIndex - 1));
  viewer?.querySelector('.gallery-viewer-next')?.addEventListener('click', () => showViewer(activeIndex + 1));
  document.addEventListener('keydown', event => {
    if (!viewer || viewer.hidden) return;
    if (event.key === 'Escape') closeViewer();
    if (event.key === 'ArrowLeft') showViewer(activeIndex - 1);
    if (event.key === 'ArrowRight') showViewer(activeIndex + 1);
  });
  window.openProjectGallery = open;
})();
