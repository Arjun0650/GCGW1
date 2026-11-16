/* GCGW project gallery: state sheet, tile grid and a shared photo/video lightbox.
   The lightbox is its own modal <dialog> so it lands in the top layer and paints
   above the state sheet; a z-index alone cannot do that. */
(() => {
  'use strict';

  const MANIFEST = window.GCGW_GALLERY_MEDIA || {};
  const sheet = document.getElementById('gallery-dialog');
  const lightbox = document.getElementById('gallery-lightbox');
  if (!sheet || !lightbox) return;

  const grid = document.getElementById('gallery-grid');
  const chips = document.getElementById('gallery-chips');
  const empty = document.getElementById('gallery-empty');
  const sheetTitle = document.getElementById('gallery-title');
  const sheetIntro = document.getElementById('gallery-intro');
  const stage = document.getElementById('gallery-lightbox-media');
  const caption = document.getElementById('gallery-lightbox-caption');
  const counter = document.getElementById('gallery-lightbox-count');
  const sheetClose = sheet.querySelector('.gallery-sheet-close');
  const ALL = 'all';
  const LAZY_AFTER = 6;

  const view = {
    states: [],
    key: '',
    items: [],
    index: 0,
    returnFocus: null,
    scrollY: 0,
    locked: false,
    swipe: null,
    stallTimer: 0,
    destroying: false
  };

  const keyOf = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const labelOf = key => String(key || '').split('-').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const pad = number => String(number).padStart(2, '0');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const clock = seconds => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${pad(total % 60)}`;
  };
  const openDialog = element => {
    if (typeof element.showModal === 'function') {
      try { element.showModal(); return; } catch {}
    }
    element.setAttribute('open', '');
  };
  const closeDialog = element => {
    if (element.open && typeof element.close === 'function') { try { element.close(); return; } catch {} }
    element.removeAttribute('open');
  };

  /* Items ------------------------------------------------------------------ */

  const posterFor = src => /-video-\d+\.mp4$/i.test(src) ? src.replace(/\.mp4$/i, '-poster.jpg') : '';
  const thumbFor = src => /-photo-\d+\.webp$/i.test(src) ? src.replace(/\.webp$/i, '-thumb.webp') : src;

  function bundledItems(key) {
    const info = MANIFEST[key] || {};
    const label = labelOf(key);
    const photos = Array.from({ length: info.photos || 0 }, (_, index) => {
      const file = `${key}-photo-${pad(index + 1)}`;
      return { type: 'image', label, src: `gallery/${key}/${file}.webp`, thumb: `gallery/${key}/${file}-thumb.webp`, alt: `${label} project photo ${index + 1}` };
    });
    const videos = Array.from({ length: info.videos || 0 }, (_, index) => {
      const file = `${key}-video-${pad(index + 1)}`;
      const meta = (info.videoInfo || [])[index] || [];
      return {
        type: 'video',
        label,
        src: `gallery/${key}/${file}.mp4`,
        poster: `gallery/${key}/${file}-poster.jpg`,
        duration: Number(meta[0]) || 0,
        width: Number(meta[1]) || 0,
        height: Number(meta[2]) || 0,
        alt: `${label} project video ${index + 1}`
      };
    });
    return [...photos, ...videos];
  }

  function normaliseItem(item, label) {
    const type = item?.type === 'video' || item?.media_type === 'video' ? 'video' : 'image';
    const src = String(item?.src || item?.media_url || '');
    if (!src) return null;
    return {
      type,
      src,
      label: item.label || label,
      alt: item.alt || `${label} project ${type}`,
      thumb: type === 'image' ? (item.thumb || thumbFor(src)) : '',
      poster: type === 'video' ? (item.poster || item.poster_url || posterFor(src)) : '',
      duration: Number(item.duration || item.duration_seconds || 0)
    };
  }

  function resolveStates() {
    const provided = typeof window.GCGW_GALLERY_STATES === 'function' ? window.GCGW_GALLERY_STATES() : null;
    const source = Array.isArray(provided) && provided.length
      ? provided
      : Object.keys(MANIFEST).map(key => ({ key, label: labelOf(key), items: bundledItems(key) }));
    return source
      .map(entry => {
        const key = keyOf(entry.key || entry.label);
        const label = String(entry.label || labelOf(key));
        const items = (entry.items || []).map(item => normaliseItem(item, label)).filter(Boolean);
        return { key, label, items };
      })
      .filter(entry => entry.items.length);
  }

  const itemsFor = key => key === ALL
    ? view.states.flatMap(entry => entry.items)
    : (view.states.find(entry => entry.key === key) || { items: [] }).items.slice();

  /* State sheet ------------------------------------------------------------ */

  function renderChips() {
    if (!chips) return;
    if (view.states.length < 2) { chips.hidden = true; chips.innerHTML = ''; return; }
    chips.hidden = false;
    const entries = view.states.length > 1 ? [{ key: ALL, label: 'All work' }, ...view.states] : view.states;
    chips.innerHTML = entries.map(entry => `<button type="button" class="gallery-chip" role="tab" data-chip="${esc(entry.key)}" aria-selected="${entry.key === view.key}" aria-controls="gallery-grid">${esc(entry.label)}</button>`).join('');
  }

  function tile(item, index) {
    const kind = item.type === 'video' ? 'Video' : 'Photo';
    const badge = item.type === 'video'
      ? `<span class="gallery-tile-badge"><span class="gallery-tile-play" aria-hidden="true"></span>${item.duration ? clock(item.duration) : 'Play'}</span>`
      : '';
    const media = item.type === 'video'
      ? (item.poster
        ? `<img src="${esc(item.poster)}" alt="" width="480" height="600" loading="${index < LAZY_AFTER ? 'eager' : 'lazy'}" decoding="async">`
        : `<video src="${esc(item.src)}#t=0.1" preload="metadata" muted playsinline tabindex="-1" aria-hidden="true"></video>`)
      : `<img src="${esc(item.thumb || item.src)}" alt="${esc(item.alt)}" width="480" height="360" loading="${index < LAZY_AFTER ? 'eager' : 'lazy'}" decoding="async">`;
    return `<button type="button" class="gallery-tile" data-gallery-index="${index}" aria-label="Open ${esc(item.alt)}">
      <span class="gallery-tile-media">${media}${badge}</span>
      <span class="gallery-tile-caption">${esc(item.label)} · ${kind}</span>
    </button>`;
  }

  function select(key) {
    view.key = key;
    view.items = itemsFor(key);
    view.index = 0;
    renderChips();
    if (grid) {
      grid.innerHTML = view.items.map(tile).join('');
      grid.hidden = view.items.length === 0;
    }
    if (empty) empty.hidden = view.items.length > 0;
    if (sheetTitle) {
      sheetTitle.textContent = key === ALL ? 'All project work' : (view.states.find(entry => entry.key === key)?.label || labelOf(key));
    }
    if (sheetIntro) {
      const photos = view.items.filter(item => item.type === 'image').length;
      const videos = view.items.length - photos;
      const parts = [photos ? `${photos} photo${photos === 1 ? '' : 's'}` : '', videos ? `${videos} video${videos === 1 ? '' : 's'}` : ''].filter(Boolean);
      const where = key === ALL ? 'from our project locations' : `from our work in ${sheetTitle?.textContent || labelOf(key)}`;
      sheetIntro.textContent = view.items.length ? `${parts.join(' and ')} ${where}.` : 'Photos and videos from this location will be added here soon.';
    }
    sheet.scrollTop = 0;
  }

  function openSheet(key, trigger) {
    view.states = resolveStates();
    if (!view.states.length) return false;
    view.returnFocus = trigger || document.activeElement;
    const match = view.states.some(entry => entry.key === key) ? key : view.states[0].key;
    lockScroll();
    select(match);
    openDialog(sheet);
    pushHistory('sheet');
    requestAnimationFrame(() => { try { sheetClose?.focus({ preventScroll: true }); } catch {} });
    return true;
  }

  function closeSheet() {
    if (lightbox.open) closeMedia();
    destroyMedia();
    closeDialog(sheet);
    unlockScroll();
  }

  /* Lightbox --------------------------------------------------------------- */

  function destroyMedia() {
    window.clearTimeout(view.stallTimer);
    view.destroying = true;
    const video = stage.querySelector('video');
    if (video) {
      try { video.pause(); } catch {}
      video.removeAttribute('src');
      try { video.load(); } catch {}
    }
    stage.replaceChildren();
    view.destroying = false;
  }

  const spinner = () => stage.querySelector('.gallery-spinner');
  const showLoader = () => { const node = spinner(); if (node) node.hidden = false; };
  const hideLoader = () => {
    window.clearTimeout(view.stallTimer);
    const node = spinner();
    if (node) node.hidden = true;
  };

  function paintMeta() {
    const item = view.items[view.index];
    if (!item) return;
    if (caption) caption.textContent = `${item.label} · ${item.type === 'video' ? 'Video' : 'Photo'}`;
    if (counter) counter.textContent = `${view.index + 1} / ${view.items.length}`;
  }

  function failMedia(message) {
    if (view.destroying) return;
    destroyMedia();
    const panel = document.createElement('div');
    panel.className = 'gallery-stage-error';
    const text = document.createElement('p');
    text.textContent = message;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', buildStage);
    panel.append(text, retry);
    stage.append(panel);
    try { retry.focus({ preventScroll: true }); } catch {}
  }

  function buildStage() {
    const item = view.items[view.index];
    if (!item) return;
    destroyMedia();
    paintMeta();

    const box = document.createElement('figure');
    box.className = 'gallery-stage-item';
    const loader = document.createElement('span');
    loader.className = 'gallery-spinner';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-label', 'Loading media');
    box.append(loader);

    if (item.type === 'video') {
      const video = document.createElement('video');
      video.className = 'gallery-stage-video';
      video.controls = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'metadata';
      video.setAttribute('aria-label', item.alt);
      if (item.poster) video.poster = item.poster;
      video.addEventListener('loadedmetadata', () => {
        if (!item.duration && video.duration) item.duration = video.duration;
        hideLoader();
      });
      video.addEventListener('playing', hideLoader);
      video.addEventListener('canplay', hideLoader);
      video.addEventListener('waiting', showLoader);
      video.addEventListener('error', () => failMedia('This video could not be played. It may be in a format your phone does not support.'));
      video.src = item.src;
      box.append(video);
    } else {
      const image = document.createElement('img');
      image.className = 'gallery-stage-image';
      image.decoding = 'async';
      image.alt = item.alt;
      image.addEventListener('load', hideLoader);
      image.addEventListener('error', () => failMedia('This photo could not be loaded. Please check your connection and try again.'));
      image.src = item.src;
      box.append(image);
    }

    stage.append(box);

    const video = box.querySelector('video');
    if (video) {
      window.clearTimeout(view.stallTimer);
      view.stallTimer = window.setTimeout(showLoader, 1200);
      requestAnimationFrame(() => {
        if (!lightbox.open) return;
        video.play().catch(() => { hideLoader(); });
      });
    }
  }

  function openMedia(index) {
    if (!view.items.length) return;
    view.index = (index + view.items.length) % view.items.length;
    const wasOpen = lightbox.open;
    buildStage();
    if (!wasOpen) {
      openDialog(lightbox);
      pushHistory('media');
    }
    try { lightbox.querySelector('.gallery-lightbox-close')?.focus({ preventScroll: true }); } catch {}
  }

  function closeMedia() {
    destroyMedia();
    closeDialog(lightbox);
    const tileEl = grid?.querySelector(`[data-gallery-index="${view.index}"]`);
    if (tileEl) { try { tileEl.focus({ preventScroll: true }); } catch {} }
  }

  const step = delta => {
    if (view.items.length < 2) return;
    openMedia(view.index + delta);
  };

  /* History: Back closes the lightbox first, then the sheet. ---------------- */

  const pushHistory = kind => {
    try { history.pushState({ gcgwGallery: kind }, ''); } catch {}
  };

  function requestClose(kind) {
    if (history.state && history.state.gcgwGallery === kind) {
      try { history.back(); } catch {}
      // Browsers throttle back-to-back history.back() calls; if ours was
      // ignored, close directly instead of leaving the sheet stuck open.
      window.setTimeout(() => {
        const stillOpen = kind === 'media' ? lightbox.open : sheet.open;
        if (!stillOpen) return;
        try { history.replaceState(null, ''); } catch {}
        if (kind === 'media') closeMedia(); else closeSheet();
      }, 320);
      return;
    }
    if (kind === 'media') closeMedia(); else closeSheet();
  }

  window.addEventListener('popstate', () => {
    const current = history.state && history.state.gcgwGallery;
    if (lightbox.open && current !== 'media') { closeMedia(); return; }
    if (sheet.open && current !== 'sheet') closeSheet();
  });

  /* Scroll lock ------------------------------------------------------------ */

  function lockScroll() {
    if (view.locked) return;
    view.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    view.locked = true;
    document.documentElement.classList.add('gallery-open');
    document.body.classList.add('gallery-open');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${view.scrollY}px`;
    document.body.style.width = '100%';
  }

  function unlockScroll() {
    if (!view.locked) return;
    view.locked = false;
    document.documentElement.classList.remove('gallery-open');
    document.body.classList.remove('gallery-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    const y = view.scrollY;
    window.scrollTo({ left: 0, top: y, behavior: 'instant' });
    // Closing a modal dialog focuses the previously focused element (often
    // <body>), which happens after this call and scrolls the page back to the
    // top. Re-apply once that task has run.
    requestAnimationFrame(() => { if (!view.locked) window.scrollTo({ left: 0, top: y, behavior: 'instant' }); });
  }

  /* Wiring ----------------------------------------------------------------- */

  document.addEventListener('click', event => {
    const chip = event.target.closest('[data-chip]');
    if (chip && sheet.open) {
      event.preventDefault();
      select(chip.dataset.chip);
      return;
    }
    const tileEl = event.target.closest('[data-gallery-index]');
    if (tileEl && sheet.open) {
      event.preventDefault();
      openMedia(Number(tileEl.dataset.galleryIndex));
      return;
    }
    const trigger = event.target.closest('[data-gallery]');
    if (!trigger || sheet.open) return;
    const card = trigger.closest('.project-card, .location-card');
    const name = card?.querySelector('h3')?.textContent?.trim()
      || String(trigger.getAttribute('aria-label') || '').replace(/^Open\s+/i, '').replace(/\s+gallery$/i, '').trim();
    if (!name) return;
    event.preventDefault();
    if (openSheet(keyOf(name), card || trigger)) event.stopPropagation();
  });

  sheetClose?.addEventListener('click', event => { event.preventDefault(); requestClose('sheet'); });
  lightbox.querySelector('.gallery-lightbox-close')?.addEventListener('click', event => { event.preventDefault(); requestClose('media'); });
  lightbox.querySelector('.gallery-lightbox-prev')?.addEventListener('click', () => step(-1));
  lightbox.querySelector('.gallery-lightbox-next')?.addEventListener('click', () => step(1));

  lightbox.addEventListener('click', event => { if (event.target === lightbox) requestClose('media'); });
  sheet.addEventListener('cancel', event => { event.preventDefault(); requestClose('sheet'); });
  lightbox.addEventListener('cancel', event => { event.preventDefault(); requestClose('media'); });
  sheet.addEventListener('close', () => {
    if (lightbox.open) closeMedia();
    destroyMedia();
    unlockScroll();
    // Runs after the browser restores focus (usually to <body>), so this is
    // the point at which the trigger can safely take focus back.
    const target = view.returnFocus;
    view.returnFocus = null;
    if (target && document.contains(target)) { try { target.focus({ preventScroll: true }); } catch {} }
  });

  document.addEventListener('keydown', event => {
    if (!lightbox.open) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    const video = stage.querySelector('video');
    if (video) { try { video.pause(); } catch {} }
  });

  stage.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) { view.swipe = null; return; }
    const touch = event.touches[0];
    const video = event.target.closest('video');
    if (video) {
      const box = video.getBoundingClientRect();
      if (touch.clientY > box.bottom - 56) { view.swipe = null; return; }
    }
    view.swipe = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  stage.addEventListener('touchmove', event => {
    const swipe = view.swipe;
    if (!swipe || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (Math.abs(touch.clientX - swipe.x) > 8 || Math.abs(touch.clientY - swipe.y) > 8) swipe.moved = true;
  }, { passive: true });

  stage.addEventListener('touchend', event => {
    const swipe = view.swipe;
    view.swipe = null;
    if (!swipe || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { step(dx < 0 ? 1 : -1); return; }
    if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.4) requestClose('media');
  }, { passive: true });

  /* Public API ------------------------------------------------------------- */

  window.GCGWGallery = {
    open: (key, trigger) => openSheet(keyOf(key), trigger),
    close: () => requestClose('sheet'),
    states: () => resolveStates()
  };
  window.openProjectGallery = id => {
    const state = id ? resolveStates().find(entry => entry.key === keyOf(id)) : null;
    if (state) { openSheet(state.key); return; }
    const project = document.querySelector(`[data-gallery="${CSS.escape(String(id))}"]`)?.closest('.project-card, .location-card');
    const name = project?.querySelector('h3')?.textContent?.trim();
    if (name) openSheet(keyOf(name), project);
  };
})();
