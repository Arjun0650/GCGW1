const config = window.GCGW_CONFIG || { supabaseUrl: '', supabaseAnonKey: '' };
const supabaseClient = config.supabaseUrl && config.supabaseAnonKey && window.supabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const locations = ['Andhra Pradesh', 'Karnataka', 'Mumbai', 'Navi Mumbai', 'Odisha', 'Pune', 'Telangana'];
const galleryCatalog = window.GCGW_GALLERY_MEDIA || {};
const suppliedGalleryCovers = {
  'karnataka': { cover: 'gallery/karnataka/karnataka-photo-01-thumb.webp', photos: 1, videos: 11 },
  'telangana': { cover: 'gallery/telangana/telangana-photo-01-thumb.webp', photos: 4, videos: 1 }
};
Object.entries(suppliedGalleryCovers).forEach(([key, details]) => {
  const existing = galleryCatalog[key] || {};
  galleryCatalog[key] = { ...details, ...existing, cover: existing.cover || details.cover, photos: Math.max(existing.photos || 0, details.photos), videos: Math.max(existing.videos || 0, details.videos) };
});
const slug = value => String(value || '').toLowerCase().replace(/\s+/g, '-');
// Ten team members in the order supplied by the owner. "(CA)" is kept as the role.
// Missing photos and roles are placeholders until the owner adds them from the dashboard.
const defaultTeam = [
  { id: '1', name: 'Gopal Chavan', role: 'Founder' },
  { id: '2', name: 'Kevil Jadhav', role: 'Co-Founder' },
  { id: '3', name: 'Pramod Jadhav', role: 'Site Operations' },
  { id: '4', name: 'Akash Jadhav', role: '[ADD ROLE]' },
  { id: '5', name: 'Arjun Chavan', role: 'Technical Support & Quotations' },
  { id: '6', name: 'Vital Chavan', role: '[ADD ROLE]' },
  { id: '7', name: 'Om Prakesh', role: '[ADD ROLE]' },
  { id: '8', name: 'Shivaji Rathod', role: '[ADD ROLE]' },
  { id: '9', name: 'Murthy', role: 'CA' },
  { id: '10', name: 'M. Shanker', role: 'CA' }
];
const fallback = { projects: locations.map((title, index) => ({ id: `location-${index}`, title, description: '', category: 'Project location', location: title, image_url: galleryCatalog[slug(title)]?.cover || '' })), team: defaultTeam, media: [] };
const localContentKey = 'gcgw-owner-content';
let data = structuredClone(fallback), activeType = 'project';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const locationName = project => project.location || project.title;
const knownLocationNames = ['Andhra Pradesh', 'Karnataka', 'Mumbai', 'Navi Mumbai', 'Odisha', 'Pune', 'Telangana'];
const stateFor = value => ['Mumbai', 'Navi Mumbai', 'Pune'].includes(String(value || '').trim()) ? 'Maharashtra' : String(value || '').trim();
const canonicalLocation = value => {
  const base = String(value || '').replace(/\s+\d+$/, '').trim();
  const city = base.split(',')[0].trim();
  return knownLocationNames.find(name => name.toLowerCase() === city.toLowerCase()) || base;
};
function normaliseLocations(projects, media) { const byName = new Map(), idMap = new Map(); projects.forEach(project => { const name = canonicalLocation(locationName(project)); const existing = byName.get(name); if (existing) { idMap.set(String(project.id), existing.id); if (!existing.image_url && project.image_url) existing.image_url = project.image_url; } else { const clean = { ...project, title: name, location: name }; byName.set(name, clean); idMap.set(String(project.id), clean.id); } }); return { projects: [...byName.values()], media: media.map(item => ({ ...item, project_id: idMap.get(String(item.project_id)) || item.project_id })) }; }
function bundledMedia(projects) { return projects.flatMap(project => { const key = slug(locationName(project)), details = galleryCatalog[key] || {}, folder = `gallery/${key}`; const photos = Array.from({ length: details.photos || 0 }, (_, index) => ({ id: `${key}-photo-${index + 1}`, project_id: project.id, media_url: `${folder}/${key}-photo-${String(index + 1).padStart(2, '0')}.webp`, media_type: 'image', sort_order: index })); const videos = Array.from({ length: details.videos || 0 }, (_, index) => ({ id: `${key}-video-${index + 1}`, project_id: project.id, media_url: `${folder}/${key}-video-${String(index + 1).padStart(2, '0')}.mp4`, media_type: 'video', sort_order: 100 + index })); return [...photos, ...videos]; }); }
const mediaFor = projectId => data.media.filter(item => String(item.project_id) === String(projectId)).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
async function api(path, options = {}) { const session = (await supabaseClient?.auth.getSession())?.data?.session; const response = await fetch(`/.netlify/functions/${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) } }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Request failed'); return response.json(); }
async function directContent() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Gallery connection is not configured.');
  const headers = { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` };
  const read = async query => {
    try {
      const response = await fetch(`${config.supabaseUrl}/rest/v1/${query}`, { headers });
      return response.ok ? await response.json() : [];
    } catch { return []; }
  };
  const [projects, team, media] = await Promise.all([
    read('projects?select=*&order=title.asc'),
    read('team_members?select=*&order=sort_order.asc,created_at.desc'),
    read('project_media?select=*&order=sort_order.asc,created_at.desc')
  ]);
  return { projects, team, media };
}
function localOwnerContent() { try { const saved = JSON.parse(localStorage.getItem(localContentKey) || '{}'); return { projects: saved.projects || [], media: saved.media || [], team: saved.team || [] }; } catch { return { projects: [], media: [], team: [] }; } }
function mergeItems(items, additions) { return [...items, ...additions.filter(item => !items.some(existing => String(existing.id) === String(item.id)))]; }
function mergeTeamMembers(...lists) { const names = new Set(); return lists.flat().filter(member => { const name = String(member?.name || '').trim().toLowerCase(); if (!name || names.has(name)) return false; names.add(name); return true; }); }
const coverWidths = { 'andhra-pradesh': 1280, 'karnataka': 736, 'mumbai': 899, 'navi-mumbai': 1280, 'odisha': 1204, 'pune': 720, 'telangana': 1280 };
const card = (project, index = 0) => { const title = locationName(project), key = slug(title), catalog = galleryCatalog[key] || {}, cover = project.image_url || catalog.cover || ''; if (!cover) return ''; const fullCover = cover === catalog.cover ? catalog.cover.replace('-thumb.webp', '.webp') : ''; const fullWidth = fullCover ? coverWidths[key] : 0; const srcset = fullWidth ? ` srcset="${esc(cover)} 480w, ${esc(fullCover)} ${fullWidth}w" sizes="${index === 0 ? '(max-width: 640px) 85vw, (max-width: 960px) 94vw, calc(100vw - 112px)' : '(max-width: 640px) 85vw, (max-width: 960px) 46vw, 300px'}"` : ''; const items = mediaFor(project.id).length || (catalog.photos || 0) + (catalog.videos || 0); const caption = `<span class="slide-caption" aria-hidden="true"><span class="slide-state">${esc(stateFor(title))}</span><span class="slide-sub">Project gallery${items ? ` · ${items} item${items === 1 ? '' : 's'}` : ''}</span></span>`; const image = `<button class="location-cover" type="button" data-gallery="${esc(project.id)}" aria-label="Open ${esc(title)} gallery"><img src="${esc(cover)}"${srcset} alt="${esc(title)} project work" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" width="480" height="360">${caption}</button>`; return `<article class="project-card location-card">${image}<div class="project-body"><span class="project-meta">Project location</span><h3>${esc(title)}</h3><button class="view-gallery" type="button" data-gallery="${esc(project.id)}">View gallery <span aria-hidden="true">→</span></button></div></article>`; };
const exploreProjectsCard = () => '<article class="project-card more-project-card"><div class="project-more-visual" aria-hidden="true"><span>Across India</span></div><div class="project-body"><span class="project-meta">Our reach</span><h3>More project locations</h3><button class="view-gallery more-project-button" type="button" data-open-project-list onclick="event.preventDefault();event.stopPropagation();gcgwOpenDialog(\'project-list-dialog\')">View locations <span aria-hidden="true">→</span></button></div></article>';
const keyPeople = [
  { name: 'Gopal Chavan', role: 'Founder', photo: 'assets/img/owner-gopal.webp', featured: true, aliases: ['gopal chavan', 'chavan gopal'] },
  { name: 'Kevil Jadhav', role: 'Co-Founder', photo: 'assets/img/owner-kevil.webp', featured: true, aliases: ['kevil jadhav', 'jadhav kevil'] },
  { name: 'Pramod Jadhav', role: 'Site Operations', photo: '', aliases: ['pramod', 'pramod jadhav', 'jadhav pramod'] },
  { name: 'Akash Jadhav', role: '[ADD ROLE]', photo: '', aliases: ['akash jadhav', 'jadhav akash'] },
  { name: 'Arjun Chavan', role: 'Technical Support & Quotations', photo: '', aliases: ['arjun chavan', 'chavan arjun'] },
  { name: 'Vital Chavan', role: '[ADD ROLE]', photo: '', aliases: ['vital chavan', 'chavan vital'] },
  { name: 'Om Prakesh', role: '[ADD ROLE]', photo: '', aliases: ['om prakesh', 'prakesh om', 'om prakash', 'prakash om'] },
  { name: 'Shivaji Rathod', role: '[ADD ROLE]', photo: '', aliases: ['shivaji rathod', 'rathod shivaji'] },
  { name: 'Murthy', role: 'CA', photo: '', aliases: ['murthy', 'murthy ca'] },
  { name: 'M. Shanker', role: 'CA', photo: '', aliases: ['m shanker', 'shanker m'] }
];
const canonicalName = value => String(value || '').toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
const roleSpelling = { 'site mannager': 'Site Manager', 'project mannager': 'Project Manager', 'co founder': 'Co-Founder' };
const roleLabel = value => roleSpelling[String(value || '').trim().toLowerCase()] || String(value || '').trim();
function personCard(person) { const member = data.team.find(item => person.aliases.includes(canonicalName(item.name))); const photo = member?.photo_url || person.photo; const role = roleLabel(member?.role || person.role); const initials = person.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2); const image = photo ? `<img src="${esc(photo)}" alt="${esc(person.name)}" width="900" height="1125" loading="lazy" decoding="async">` : `<span class="person-initials" role="img" aria-label="${esc(person.name)} — photo to be added">${esc(initials)}</span>`; return `<article class="person-card${person.featured ? ' person-card--lead' : ''}"><div class="person-photo">${image}</div><div class="person-body"><h3>${esc(person.name)}</h3><p class="person-role">${esc(role)}</p></div></article>`; }
function draw() { const projects = [...data.projects].sort((a, b) => locationName(a).localeCompare(locationName(b))); $('#projects-grid').innerHTML = `${projects.map(card).join('')}${exploreProjectsCard()}`; $('#team-grid').innerHTML = keyPeople.map(personCard).join(''); carouselRefresh(); }
function drawTestimonials() {
  const section = $('#testimonials');
  if (!section) return;
  const approved = (window.GCGW_SITE?.testimonials || []).filter(item => item.approved === true && String(item.quote || '').trim() && !String(item.quote).trim().startsWith('[ADD'));
  $('#testimonial-grid').innerHTML = approved.map(item => `<figure class="quote-card"><span class="quote-mark" aria-hidden="true">“</span><blockquote><p>${esc(item.quote)}</p></blockquote><figcaption><strong>${esc(item.clientName)}</strong><span>${[item.personName, item.role].filter(Boolean).map(esc).join(' · ')}</span></figcaption></figure>`).join('');
  section.hidden = approved.length === 0;
  if (!approved.length) return;
  $('#testimonial-note').hidden = false;
  const faqKicker = $('#faq .kicker');
  const contactKicker = $('#contact .kicker');
  if (faqKicker) faqKicker.textContent = '08 / Questions';
  if (contactKicker) contactKicker.textContent = '09 / Contact';
}
async function load() {
  draw();
  let content = {};
  try {
    content = await api('content');
  } catch {
    // Opening index.html directly has no Netlify server. Read the public gallery data from Supabase instead.
    try { content = await directContent(); } catch {}
  }
  const saved = localOwnerContent();
  content = { projects: mergeItems(content.projects || [], saved.projects), media: mergeItems(content.media || [], saved.media), team: mergeItems(content.team || [], saved.team) };
  const grouped = normaliseLocations([...fallback.projects, ...(content.projects || [])], content.media || []);
  data = { projects: grouped.projects, team: mergeTeamMembers(content.team || [], fallback.team), media: [...grouped.media, ...bundledMedia(grouped.projects)] };
  draw();
}
function openDialog(dialog) { try { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); } catch { dialog.setAttribute('open', ''); } }
function closeDialog(dialog) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); }
function openGallery(id) { const project = data.projects.find(item => String(item.id) === String(id)); if (!project) return; const title = locationName(project); const items = mediaFor(id); $('#gallery-title').textContent = title; $('#gallery-intro').textContent = items.length ? `${items.length} photo${items.length === 1 ? '' : 's'} and video${items.some(item => item.media_type === 'video') ? 's' : ''} from our work in ${title}.` : `Photos and videos from our work in ${title} will be added here soon.`; $('#gallery-grid').innerHTML = items.length ? items.map(item => item.media_type === 'video' ? `<video controls preload="metadata" src="${esc(item.media_url)}" aria-label="${esc(item.alt_text || `${title} project video`)}"></video>` : `<img src="${esc(item.media_url)}" alt="${esc(item.alt_text || `${title} project photo`)}" loading="lazy">`).join('') : (project.image_url ? `<img src="${esc(project.image_url)}" alt="${esc(title)} project location">` : ''); openDialog($('#gallery-dialog')); }
window.openProjectGallery = openGallery;
function setMessage(message, error = false) { const element = $('#auth-message'); element.textContent = message; element.style.color = error ? '#b42318' : ''; }

/* Mobile project carousel ------------------------------------------------ */
const carouselTrack = $('#projects-grid');
const carouselDots = $('#projects-dots');
const carouselCount = $('#projects-count');
const carouselQuery = window.matchMedia('(max-width: 640px)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let carouselIndex = 0, carouselPausedUntil = 0, carouselVisible = false, carouselElapsed = 0, carouselFrame = 0;
const carouselCards = () => carouselTrack ? [...carouselTrack.querySelectorAll('.project-card')] : [];
function syncCarouselSemantics() {
  if (!carouselTrack) return;
  if (carouselQuery.matches) {
    carouselTrack.setAttribute('role', 'region');
    carouselTrack.setAttribute('aria-roledescription', 'carousel');
    carouselTrack.setAttribute('aria-label', 'Project locations');
    carouselTrack.setAttribute('tabindex', '0');
  } else {
    carouselTrack.removeAttribute('role');
    carouselTrack.removeAttribute('aria-roledescription');
    carouselTrack.removeAttribute('aria-label');
    carouselTrack.removeAttribute('tabindex');
  }
}
function paintCarousel() {
  const list = carouselCards();
  if (carouselCount) {
    carouselCount.textContent = list.length ? `${carouselIndex + 1} / ${list.length}` : '0 / 0';
    carouselCount.setAttribute('aria-label', `Show next project, slide ${carouselIndex + 1} of ${list.length}`);
  }
  [...(carouselDots?.children || [])].forEach((dot, index) => {
    const active = index === carouselIndex;
    dot.classList.toggle('active', active);
    dot.setAttribute('aria-selected', String(active));
    dot.setAttribute('aria-current', active ? 'true' : 'false');
    dot.tabIndex = active ? 0 : -1;
  });
}
function goToSlide(index, scroll = true) {
  const list = carouselCards();
  if (!list.length) return;
  carouselIndex = Math.max(0, Math.min(list.length - 1, index));
  if (scroll && carouselTrack) {
    const card = list[carouselIndex];
    const left = card.offsetLeft - (carouselTrack.clientWidth - card.offsetWidth) / 2;
    carouselTrack.scrollTo({ left, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }
  paintCarousel();
}
function holdCarousel(ms = 12000) { carouselPausedUntil = Date.now() + ms; carouselElapsed = 0; }
function carouselRefresh() {
  if (!carouselDots) return;
  const list = carouselCards();
  carouselDots.innerHTML = list.map((card, index) => `<button class="carousel-dot" type="button" role="tab" aria-label="Show ${esc(card.querySelector('h3')?.textContent?.trim() || `slide ${index + 1}`)}" aria-selected="false"><span></span></button>`).join('');
  [...carouselDots.children].forEach((dot, index) => dot.addEventListener('click', () => { goToSlide(index); holdCarousel(); }));
  if (carouselIndex >= list.length) carouselIndex = 0;
  syncCarouselSemantics();
  goToSlide(carouselIndex, false);
}
carouselTrack?.addEventListener('scroll', () => {
  if (!carouselQuery.matches) return;
  cancelAnimationFrame(carouselFrame);
  carouselFrame = requestAnimationFrame(() => {
    const list = carouselCards();
    if (!list.length) return;
    const centre = carouselTrack.scrollLeft + carouselTrack.clientWidth / 2;
    let best = 0, distance = Infinity;
    list.forEach((card, index) => { const next = Math.abs(card.offsetLeft + card.offsetWidth / 2 - centre); if (next < distance) { distance = next; best = index; } });
    if (best !== carouselIndex) { carouselIndex = best; paintCarousel(); }
  });
}, { passive: true });
carouselTrack?.addEventListener('keydown', event => {
  if (!carouselQuery.matches) return;
  const total = carouselCards().length;
  if (!total) return;
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (step) { event.preventDefault(); goToSlide((carouselIndex + step + total) % total); holdCarousel(); }
  else if (event.key === 'Home') { event.preventDefault(); goToSlide(0); holdCarousel(); }
  else if (event.key === 'End') { event.preventDefault(); goToSlide(total - 1); holdCarousel(); }
});
['pointerdown', 'touchstart', 'focusin'].forEach(type => carouselTrack?.addEventListener(type, () => holdCarousel(), { passive: type !== 'focusin' }));
carouselCount?.addEventListener('click', () => { const total = carouselCards().length; if (total) goToSlide(carouselIndex + 1 >= total ? 0 : carouselIndex + 1); holdCarousel(); });
carouselQuery.addEventListener?.('change', event => { syncCarouselSemantics(); carouselIndex = 0; if (!event.matches) carouselTrack.scrollTo({ left: 0 }); else goToSlide(0, false); });
if ('IntersectionObserver' in window && carouselTrack) {
  new IntersectionObserver(entries => { carouselVisible = entries[0].isIntersecting; if (!carouselVisible) carouselElapsed = 0; }, { threshold: 0.35 }).observe(carouselTrack);
}
setInterval(() => {
  if (!carouselQuery.matches || reducedMotion.matches || document.hidden || !carouselVisible || Date.now() < carouselPausedUntil) { carouselElapsed = 0; return; }
  carouselElapsed += 1;
  if (carouselElapsed < 6) return;
  carouselElapsed = 0;
  const total = carouselCards().length;
  if (total > 1) goToSlide(carouselIndex + 1 >= total ? 0 : carouselIndex + 1);
}, 1000);

/* Enquiry form ----------------------------------------------------------- */
const inquiryDialog = $('#inquiry-dialog');
const enquiryForms = [...document.querySelectorAll('[data-inquiry-form]')];
const enquiryRateKey = 'gcgw-enquiry-last';
const localEnquiriesKey = 'gcgw-local-enquiries';
let inquiryReturnFocus = null;
let enquirySending = false;
const phonePattern = /^[6-9]\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function localEnquiries() { try { const list = JSON.parse(localStorage.getItem(localEnquiriesKey) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } }
function saveLocalEnquiry(payload) { try { const list = localEnquiries(); list.unshift({ ...payload, id: crypto.randomUUID?.() || String(Date.now()), created_at: new Date().toISOString() }); localStorage.setItem(localEnquiriesKey, JSON.stringify(list.slice(0, 100))); } catch {} }
function normalisePhone(value) { const digits = String(value || '').replace(/\D/g, ''); const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits; return phonePattern.test(local) ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : ''; }
function setFieldError(form, name, text) {
  const box = form.querySelector(`[data-error="${name}"]`);
  const field = form.elements[name];
  if (box) { box.textContent = text || ''; box.classList.toggle('show', Boolean(text)); }
  if (field) field.setAttribute('aria-invalid', text ? 'true' : 'false');
}
function validateEnquiry(form) {
  const values = Object.fromEntries(new FormData(form));
  const name = String(values.name || '').trim();
  const phone = normalisePhone(values.phone);
  const email = String(values.email || '').trim();
  const requirement = String(values.requirement || '').trim();
  const emailInvalid = Boolean(email) && !emailPattern.test(email);
  setFieldError(form, 'name', name.length < 2 ? 'Enter your name.' : '');
  setFieldError(form, 'phone', phone ? '' : 'Enter a 10-digit Indian mobile number.');
  setFieldError(form, 'email', emailInvalid ? 'Check the email address or leave it blank.' : '');
  setFieldError(form, 'service', values.service ? '' : 'Choose the service you need.');
  setFieldError(form, 'requirement', requirement.length < 10 ? 'Add at least 10 characters about the work.' : '');
  if (name.length < 2 || !phone || emailInvalid || !values.service || requirement.length < 10) return null;
  return {
    name: name.slice(0, 120),
    phone,
    email: email ? email.slice(0, 160) : null,
    location: String(values.location || '').trim().slice(0, 120) || null,
    service: String(values.service).slice(0, 120),
    requirement: requirement.slice(0, 2000),
    source: String(values.source || 'Website').slice(0, 80)
  };
}
function enquiryStatus(form, text, tone = '') {
  const status = form.querySelector('.form-status');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('error', tone === 'error');
  status.classList.toggle('success', tone === 'success');
}
async function sendEnquiry(form) {
  if (enquirySending) return;
  if (String(form.elements.company?.value || '').trim()) return;
  if (Date.now() - Number(form.dataset.dwell || 0) < 1500) return;
  const payload = validateEnquiry(form);
  if (!payload) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    enquiryStatus(form, 'Please check the highlighted fields.', 'error');
    return;
  }
  const last = Number(localStorage.getItem(enquiryRateKey) || 0);
  if (last && Date.now() - last < 60000) { enquiryStatus(form, 'Please wait a minute before sending another enquiry.', 'error'); return; }
  if (!config.supabaseUrl || !config.supabaseAnonKey) { enquiryStatus(form, 'The enquiry service is not configured. Please call +91 93985 77232.', 'error'); return; }
  const button = form.querySelector('[type="submit"]');
  enquirySending = true;
  if (button) { button.dataset.label = button.textContent; button.disabled = true; button.textContent = 'Sending…'; }
  enquiryStatus(form, 'Sending your enquiry…');
  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/enquiries`, {
      method: 'POST',
      headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.message || 'Request failed.');
    }
    saveLocalEnquiry(payload);
    localStorage.setItem(enquiryRateKey, String(Date.now()));
    form.reset();
    form.dataset.dwell = String(Date.now());
    enquiryStatus(form, 'Thank you. We will call you within one working day.', 'success');
  } catch (error) {
    const text = /too many enquiries/i.test(error.message || '') ? 'Please call +91 93985 77232 — we already have a recent enquiry from this number.' : 'We could not send the enquiry. Please check your connection or call +91 93985 77232.';
    enquiryStatus(form, text, 'error');
  } finally {
    enquirySending = false;
    if (button) { button.disabled = false; button.textContent = button.dataset.label || 'Send enquiry'; }
  }
}
enquiryForms.forEach((form, index) => {
  form.dataset.dwell = String(Date.now());
  form.querySelectorAll('[data-error]').forEach(box => {
    const field = form.elements[box.dataset.error];
    if (!field) return;
    box.id = `enquiry-${index}-${box.dataset.error}-error`;
    field.setAttribute('aria-describedby', box.id);
  });
  form.addEventListener('submit', event => { event.preventDefault(); sendEnquiry(form); });
  form.addEventListener('input', event => { if (event.target.name && event.target.name !== 'company') setFieldError(form, event.target.name, ''); });
  form.addEventListener('change', event => { if (event.target.name) setFieldError(form, event.target.name, ''); });
});
function openInquiry(trigger) {
  if (!inquiryDialog) return;
  inquiryReturnFocus = trigger && trigger.focus ? trigger : document.activeElement;
  try { if (inquiryDialog.showModal) inquiryDialog.showModal(); else inquiryDialog.setAttribute('open', ''); } catch { inquiryDialog.setAttribute('open', ''); }
  document.body.classList.add('inquiry-open');
  const form = inquiryDialog.querySelector('[data-inquiry-form]');
  if (form) form.dataset.dwell = String(Date.now());
  requestAnimationFrame(() => inquiryDialog.querySelector('input[name="name"]')?.focus({ preventScroll: true }));
}
function closeInquiry() {
  if (!inquiryDialog) return;
  try { inquiryDialog.close(); } catch { inquiryDialog.removeAttribute('open'); }
  document.body.classList.remove('inquiry-open');
}
window.gcgwInquiry = () => openInquiry(document.activeElement);
inquiryDialog?.addEventListener('close', () => { document.body.classList.remove('inquiry-open'); inquiryReturnFocus?.focus?.({ preventScroll: true }); });
inquiryDialog?.addEventListener('click', event => {
  if (event.target !== inquiryDialog) return;
  const rect = inquiryDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeInquiry();
});
let sheetStartY = 0, sheetPull = 0, sheetDragging = false;
inquiryDialog?.addEventListener('touchstart', event => {
  if (!window.matchMedia('(max-width: 760px)').matches || inquiryDialog.scrollTop > 0) return;
  sheetDragging = true; sheetPull = 0; sheetStartY = event.touches[0].clientY;
}, { passive: true });
inquiryDialog?.addEventListener('touchmove', event => {
  if (!sheetDragging) return;
  sheetPull = Math.max(0, event.touches[0].clientY - sheetStartY);
  if (sheetPull) inquiryDialog.style.transform = `translateY(${sheetPull}px)`;
}, { passive: true });
inquiryDialog?.addEventListener('touchend', () => {
  if (!sheetDragging) return;
  sheetDragging = false;
  inquiryDialog.style.transform = '';
  if (sheetPull > 90) closeInquiry();
  sheetPull = 0;
}, { passive: true });
if (window.visualViewport) {
  const viewport = window.visualViewport;
  const updateKeyboard = () => document.body.classList.toggle('keyboard-open', viewport.height < window.innerHeight - 140);
  viewport.addEventListener('resize', updateKeyboard);
}

/* Owner dashboard: enquiries tab ----------------------------------------- */
let adminEnquiries = null, adminEnquiriesLoading = false;
function enquiryDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function paintEnquiries() {
  const list = $('#admin-list');
  if (!list) return;
  const items = adminEnquiries || [];
  if (!items.length) { list.innerHTML = '<p class="loading">No enquiries yet. New website enquiries will appear here.</p>'; return; }
  list.innerHTML = `<div class="enquiry-toolbar"><span>${items.length} enquir${items.length === 1 ? 'y' : 'ies'} — newest first</span><button type="button" data-refresh-enquiries>Refresh</button></div><div class="enquiry-list">${items.map(item => {
    const phone = String(item.phone || '');
    const digits = phone.replace(/\D/g, '');
    const waNumber = digits.length === 10 ? `91${digits}` : digits;
    return `<article class="enquiry-card"><header><h3>${esc(item.name)}</h3><time datetime="${esc(item.created_at || '')}">${esc(enquiryDate(item.created_at))}</time></header><p class="enquiry-meta">${esc([item.service, item.location].filter(Boolean).join(' · ') || 'Service not specified')}${item.email ? `<br>${esc(item.email)}` : ''}<br>${esc(phone)}</p><p class="enquiry-requirement">${esc(item.requirement)}</p><div class="enquiry-actions"><a href="tel:${esc(digits)}">Call</a><a href="https://wa.me/${esc(waNumber)}?text=${encodeURIComponent(`Hello ${item.name}, thank you for your enquiry to GCGW.`)}" target="_blank" rel="noopener">WhatsApp</a></div></article>`;
  }).join('')}</div>`;
  list.querySelector('[data-refresh-enquiries]')?.addEventListener('click', () => loadAdminEnquiries(true));
}
async function loadAdminEnquiries(force = false) {
  if (adminEnquiriesLoading) return;
  if (adminEnquiries && !force) { paintEnquiries(); return; }
  const list = $('#admin-list');
  adminEnquiriesLoading = true;
  if (list) list.innerHTML = '<p class="loading">Loading enquiries…</p>';
  try {
    const result = await api('content/enquiries');
    adminEnquiries = (result.enquiries || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch {
    adminEnquiries = localEnquiries();
  } finally {
    adminEnquiriesLoading = false;
  }
  paintEnquiries();
}

const auth = $('#auth-dialog'), admin = $('#admin-dialog'), gallery = $('#gallery-dialog');
$('.menu-button').onclick = () => { const nav = $('nav'); const isOpen = nav.classList.toggle('open'); $('.menu-button').setAttribute('aria-expanded', String(isOpen)); };
document.querySelectorAll('nav a').forEach(link => link.onclick = () => { $('nav').classList.remove('open'); $('.menu-button').setAttribute('aria-expanded', 'false'); });
document.querySelectorAll('.close').forEach(button => button.onclick = () => closeDialog(button.closest('dialog')));
document.addEventListener('click', event => {
  const galleryTrigger = event.target.closest('[data-gallery]');
  if (galleryTrigger) { event.preventDefault(); openGallery(galleryTrigger.dataset.gallery); return; }
  if (event.target.closest('[data-open-project-list]')) { event.preventDefault(); openDialog($('#project-list-dialog')); return; }
  const inquiryTrigger = event.target.closest('[data-open-inquiry]');
  if (inquiryTrigger) { event.preventDefault(); openInquiry(inquiryTrigger); }
});
  const loginTrigger = $('[data-open-login]');
  if (loginTrigger) loginTrigger.onclick = () => openDialog(auth);
  const projectList = $('#project-list-dialog');
  $('.project-list-contact').onclick = () => { closeDialog(projectList); openInquiry(document.querySelector('.nav-cta')); };
$('[data-show-recovery]').onclick = () => { $('#login-view').hidden = true; $('#recovery-view').hidden = false; setMessage(''); };
$('[data-show-login]').onclick = () => { $('#login-view').hidden = false; $('#recovery-view').hidden = true; setMessage(''); };
$('#login-form').onsubmit = async event => { event.preventDefault(); if (!supabaseClient) return setMessage('Owner login is not configured yet.', true); const submit = event.target.querySelector('[type=submit]'); try { submit.disabled = true; setMessage('Signing in…'); const { error } = await supabaseClient.auth.signInWithPassword(Object.fromEntries(new FormData(event.target))); if (error) throw error; const isOwner = await loggedIn(true); if (isOwner) { closeDialog(auth); renderEditor(); openDialog(admin); } } catch (error) { setMessage(error.message || 'Unable to sign in.', true); } finally { submit.disabled = false; } };
$('#recovery-form').onsubmit = async event => { event.preventDefault(); if (!supabaseClient) return setMessage('Add your Supabase configuration first.', true); const phone = new FormData(event.target).get('phone'); const { error } = await supabaseClient.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } }); if (error) return setMessage(error.message, true); $('#otp-form').hidden = false; setMessage('Verification code sent.'); };
$('#otp-form').onsubmit = async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)), phone = new FormData($('#recovery-form')).get('phone'); const { error } = await supabaseClient.auth.verifyOtp({ phone, token: values.token, type: 'sms' }); if (error) return setMessage(error.message, true); const reset = await supabaseClient.auth.updateUser({ password: values.password }); if (reset.error) return setMessage(reset.error.message, true); setMessage('Password updated. You can now sign in.'); };
async function loggedIn(showError = false) { try { const profile = await api('admin-check'); if (!profile.isAdmin) throw new Error('This account is not an authorised administrator. Ask the site administrator to enable Owner access for this account.'); $('#open-admin').hidden = false; return true; } catch (error) { await supabaseClient.auth.signOut(); if (showError) setMessage(error.message || 'Owner access could not be verified.', true); return false; } }

const fields = { project: [['title', 'Location / project name'], ['image_url', 'Cover image URL (optional)'], ['description', 'Short description (optional)', 'textarea']], media: [['project_id', 'Choose location'], ['media_url', 'Photo or video URL (optional)'], ['media_type', 'Media type'], ['alt_text', 'Description (optional)'], ['sort_order', 'Display order']], member: [['name', 'Member name'], ['role', 'Role'], ['photo_url', 'Photo URL (optional)']] };
const labelFor = id => locationName(data.projects.find(project => String(project.id) === String(id)) || {});
function inputField([name, label, type], item) { if (name === 'project_id') return `<label>${label}<select name="project_id" required><option value="">Select a location</option>${data.projects.sort((a, b) => locationName(a).localeCompare(locationName(b))).map(project => `<option value="${esc(project.id)}" ${String(project.id) === String(item.project_id) ? 'selected' : ''}>${esc(locationName(project))}</option>`).join('')}</select></label>`; if (name === 'media_type') return `<label>${label}<select name="media_type"><option value="image" ${item.media_type !== 'video' ? 'selected' : ''}>Photo</option><option value="video" ${item.media_type === 'video' ? 'selected' : ''}>Video</option></select></label>`; return `<label class="${type === 'textarea' ? 'full' : ''}">${label}${type === 'textarea' ? `<textarea name="${name}">${esc(item[name] || '')}</textarea>` : `<input name="${name}" value="${esc(item[name] || '')}" ${name === 'image_url' || name === 'photo_url' || name === 'media_url' || name === 'alt_text' || name === 'description' || name === 'sort_order' ? '' : 'required'}>`}</label>`; }
function currentList() { return activeType === 'project' ? data.projects : activeType === 'media' ? data.media : data.team; }
const uploadField = () => activeType === 'project' ? '<label class="full">Upload location cover photo<input type="file" name="upload_file" accept="image/*"><span class="upload-help">Optional — this replaces the cover image URL.</span></label>' : activeType === 'media' ? '<label class="full">Upload gallery photo or video<input type="file" name="upload_file" accept="image/*,video/*"><span class="upload-help">Select the location above, then choose the file.</span></label>' : '<label class="full">Upload member photo<input type="file" name="upload_file" accept="image/*"><span class="upload-help">Optional — this replaces the photo URL.</span></label>';
function renderEditor(item = {}) { if (activeType === 'enquiry') { $('#editor-form').hidden = true; loadAdminEnquiries(); return; } $('#editor-form').hidden = false; $('#editor-form [name=id]').value = item.id || ''; $('#form-fields').innerHTML = `<div class="form-grid">${fields[activeType].map(field => inputField(field, item)).join('')}${uploadField()}</div>`; const list = currentList(); $('#admin-list').innerHTML = list.map(item => { const heading = activeType === 'project' ? locationName(item) : activeType === 'media' ? `${labelFor(item.project_id)} — ${item.media_type || 'photo'}` : item.name; const image = activeType === 'project' ? item.image_url : activeType === 'member' ? item.photo_url : ''; return `<div class="admin-item"><div>${image ? `<img src="${esc(image)}" alt="">` : ''}<strong>${esc(heading)}</strong><p>${esc(activeType === 'media' ? item.media_url : item.role || '')}</p></div><div><button data-edit="${esc(item.id)}">Edit</button><button data-delete="${esc(item.id)}">Delete</button></div></div>`; }).join('') || '<p class="loading">Nothing added yet.</p>'; document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => renderEditor(list.find(item => String(item.id) === button.dataset.edit))); document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { if (confirm('Delete this item?')) { try { await api(`content/${activeType === 'project' ? 'projects' : activeType === 'media' ? 'media' : 'team'}/${button.dataset.delete}`, { method: 'DELETE' }); await load(); renderEditor(); } catch (error) { setAdminMessage(error.message, true); } } }); }
$('#open-admin').onclick = () => { renderEditor(); openDialog(admin); }; $('#sign-out').onclick = async () => { await supabaseClient.auth.signOut(); $('#open-admin').hidden = true; closeDialog(admin); };
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { activeType = button.dataset.tab; document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button)); renderEditor(); });
$('#cancel-edit').onclick = () => renderEditor();
function setAdminMessage(message = '', error = false) { const element = $('#admin-message'); element.textContent = message; element.classList.toggle('error', error); }
async function uploadOwnerFile(file) { if (!file) return ''; if (!supabaseClient) throw new Error('Supabase is not configured.'); const maxSize = file.type.startsWith('video/') ? 80 * 1024 * 1024 : 15 * 1024 * 1024; if (file.size > maxSize) throw new Error('This file is too large. Use an image under 15 MB or a video under 80 MB.'); const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'); const path = `owner-uploads/${Date.now()}-${crypto.randomUUID()}-${safeName}`; const { error } = await supabaseClient.storage.from('site-media').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type }); if (error) throw error; return supabaseClient.storage.from('site-media').getPublicUrl(path).data.publicUrl; }
$('#editor-form').onsubmit = async event => { event.preventDefault(); const form = new FormData(event.target); const id = form.get('id'); const file = form.get('upload_file'); form.delete('id'); form.delete('upload_file'); const values = Object.fromEntries(form); const saveButton = event.target.querySelector('[type=submit]'); try { saveButton.disabled = true; setAdminMessage(file?.size ? 'Uploading file…' : 'Saving…'); if (file?.size) { const url = await uploadOwnerFile(file); if (activeType === 'project') values.image_url = url; if (activeType === 'media') { values.media_url = url; values.media_type = file.type.startsWith('video/') ? 'video' : 'image'; } if (activeType === 'member') values.photo_url = url; } if (activeType === 'media') { if (!values.media_url) throw new Error('Choose a file or add a media URL.'); values.sort_order = Number(values.sort_order || 0); } if (activeType === 'project') { values.location = values.title; values.description = values.description || ''; } const collection = activeType === 'project' ? 'projects' : activeType === 'media' ? 'media' : 'team'; await api(`content/${collection}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) }); await load(); renderEditor(); setAdminMessage('Saved successfully.'); } catch (error) { setAdminMessage(error.message || 'Unable to save this item.', true); } finally { saveButton.disabled = false; } };
$('#year').textContent = new Date().getFullYear(); drawTestimonials(); load(); if (new URLSearchParams(location.search).get('login') === '1') openDialog(auth); if (supabaseClient) supabaseClient.auth.getSession().then(({ data: { session } }) => { if (session) loggedIn(); }).catch(() => {});

/* Hero: the fixed action bar repeats the hero buttons, so keep it off the
   first screen and show it once the hero has been scrolled past. */
const heroSection = $('.hero');
if (heroSection && 'IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    document.body.classList.toggle('hero-visible', entry.isIntersecting && entry.intersectionRatio > 0.55);
  }, { threshold: [0, 0.55, 1] }).observe(heroSection);
}
