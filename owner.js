(() => {
if (window.__GCGW_OWNER_LOADED__) return;
window.__GCGW_OWNER_LOADED__ = true;
const config = window.GCGW_CONFIG || {};
const supabase = config.supabaseUrl && config.supabaseAnonKey && window.supabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
let activeTab = 'projects';
let content = { projects: [], media: [], team: [] };
const localPreview = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);

function message(id, text = '', error = false) { const element = $(id); element.textContent = text; element.classList.toggle('error', error); }
function localTable(collection) { return collection === 'projects' ? 'projects' : collection === 'media' ? 'project_media' : collection === 'team' ? 'team_members' : null; }
async function fileApi(path, options = {}) {
  const [collection, id] = path.split('/');
  if (path === 'admin-check') {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Sign in is required.');
    const { data: profile, error } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return { isAdmin: Boolean(profile?.is_admin) };
  }
  if (path === 'content' && (!options.method || options.method === 'GET')) {
    const [{ data: projects, error: projectError }, { data: team, error: teamError }, { data: media, error: mediaError }] = await Promise.all([
      supabase.from('projects').select('*').order('title', { ascending: true }),
      supabase.from('team_members').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      supabase.from('project_media').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false })
    ]);
    if (projectError || teamError || mediaError) throw projectError || teamError || mediaError;
    return { projects: projects || [], team: team || [], media: media || [] };
  }
  const table = localTable(collection);
  if (!table) throw new Error('Request not found.');
  const values = options.body ? JSON.parse(options.body) : {};
  let result;
  if (options.method === 'POST') result = await supabase.from(table).insert(values).select().single();
  else if (options.method === 'PUT' && id) result = await supabase.from(table).update(values).eq('id', id).select().single();
  else if (options.method === 'DELETE' && id) result = await supabase.from(table).delete().eq('id', id);
  else throw new Error('This action is not available.');
  if (result.error) throw result.error;
  return result.data || { ok: true };
}
async function api(path, options = {}) {
  if (localPreview) return fileApi(path, options);
  const session = (await supabase?.auth.getSession())?.data?.session;
  const response = await fetch(`/.netlify/functions/${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Request failed.');
  return response.json();
}
async function isOwner() { if (localPreview) return true; const profile = await api('admin-check'); return Boolean(profile.isAdmin); }
async function loadContent() { content = await api('content'); render(); }
function labels() { return activeTab === 'projects' ? ['ADD A PROJECT', 'New project or location', 'Projects & locations', 'Add a location and its cover picture.'] : activeTab === 'gallery' ? ['ADD GALLERY MEDIA', 'Upload a photo or video', 'Gallery uploads', 'Choose the location for every photo or video.'] : ['ADD TEAM MEMBER', 'New team member', 'Team members', 'Add names, roles and member photos.']; }
function fieldMarkup(item = {}) { const locations = content.projects.map(project => `<option value="${escapeHtml(project.id)}" ${String(project.id) === String(item.project_id) ? 'selected' : ''}>${escapeHtml(project.location || project.title)}</option>`).join(''); if (activeTab === 'projects') return `<label>Location / project name<input name="title" value="${escapeHtml(item.title || item.location || '')}" required></label><label>Cover image URL (optional)<input name="image_url" value="${escapeHtml(item.image_url || '')}"></label><label class="full">Short description (optional)<textarea name="description">${escapeHtml(item.description || '')}</textarea></label><label class="full">Upload cover photo<input type="file" name="upload_file" accept="image/*"><span class="upload-note">Choose a photo instead of entering an image URL.</span></label>`; if (activeTab === 'gallery') return `<label>Location<select name="project_id" required><option value="">Select a location</option>${locations}</select></label><label>Media type<select name="media_type"><option value="image" ${item.media_type !== 'video' ? 'selected' : ''}>Photo</option><option value="video" ${item.media_type === 'video' ? 'selected' : ''}>Video</option></select></label><label class="full">Photo / video URL (optional)<input name="media_url" value="${escapeHtml(item.media_url || '')}"></label><label>Caption (optional)<input name="alt_text" value="${escapeHtml(item.alt_text || '')}"></label><label>Display order<input name="sort_order" type="number" value="${escapeHtml(item.sort_order || 0)}"></label><label class="full">Upload photo or video<input type="file" name="upload_file" accept="image/*,video/*"><span class="upload-note">Choose the location first, then select the file.</span></label>`; return `<label>Member name<input name="name" value="${escapeHtml(item.name || '')}" required></label><label>Role<input name="role" value="${escapeHtml(item.role || '')}" required></label><label class="full">Photo URL (optional)<input name="photo_url" value="${escapeHtml(item.photo_url || '')}"></label><label class="full">Upload member photo<input type="file" name="upload_file" accept="image/*"><span class="upload-note">Choose a photo instead of entering a photo URL.</span></label>`; }
function records() { return activeTab === 'projects' ? content.projects : activeTab === 'gallery' ? content.media : content.team; }
function recordInfo(item) { if (activeTab === 'projects') return [item.location || item.title, item.description || 'Project location', item.image_url]; if (activeTab === 'gallery') { const project = content.projects.find(entry => String(entry.id) === String(item.project_id)); return [`${project?.location || project?.title || 'Unknown location'} — ${item.media_type || 'photo'}`, item.media_url, '']; } return [item.name, item.role, item.photo_url]; }
function renderForm(item = {}) { const [kicker, title] = labels(); $('#editor-kicker').textContent = kicker; $('#editor-title').textContent = title; $('#owner-editor [name=id]').value = item.id || ''; $('#owner-fields').innerHTML = fieldMarkup(item); message('#editor-message'); }
function renderList() { const [, , title, note] = labels(); $('#list-title').textContent = title; $('#list-note').textContent = note; $('#owner-list').innerHTML = records().map(item => { const [heading, detail, image] = recordInfo(item); return `<article class="record"><div class="record-main">${image ? `<img src="${escapeHtml(image)}" alt="">` : ''}<strong>${escapeHtml(heading)}</strong><p>${escapeHtml(detail || '')}</p></div><div class="record-actions"><button type="button" data-edit="${escapeHtml(item.id)}">Edit</button><button type="button" class="delete" data-delete="${escapeHtml(item.id)}">Delete</button></div></article>`; }).join('') || '<p>No items added yet.</p>'; document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => renderForm(records().find(item => String(item.id) === button.dataset.edit))); document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { if (!confirm('Delete this item?')) return; try { await api(`content/${activeTab === 'projects' ? 'projects' : activeTab === 'gallery' ? 'media' : 'team'}/${button.dataset.delete}`, { method: 'DELETE' }); await loadContent(); renderForm(); } catch (error) { message('#editor-message', error.message, true); } }); }
function render() { renderForm(); renderList(); }
async function upload(file) { const limit = file.type.startsWith('video/') ? 80 * 1024 * 1024 : 15 * 1024 * 1024; if (file.size > limit) throw new Error('File is too large. Images must be under 15 MB and videos under 80 MB.'); const name = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'); const path = `owner-uploads/${Date.now()}-${crypto.randomUUID()}-${name}`; const { error } = await supabase.storage.from('site-media').upload(path, file, { cacheControl: '31536000', contentType: file.type }); if (error) throw error; return supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl; }
async function openDashboard() { $('#owner-login').hidden = true; $('#owner-dashboard').hidden = false; try { await loadContent(); } catch (_) { render(); } }
$('#owner-login-form').onsubmit = async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); if (!values.email || !values.password) return message('#login-message', 'Enter both fields to continue.', true); const button = event.target.querySelector('button'); try { button.disabled = true; if (localPreview) { message('#login-message', 'Opening dashboard…'); await openDashboard(); return; } if (!supabase) return message('#login-message', 'The secure sign-in service could not load. Check your internet connection and reopen this page.', true); message('#login-message', 'Signing in…'); const { error } = await supabase.auth.signInWithPassword(values); if (error) throw error; if (!await isOwner()) throw new Error('This account is signed in, but it does not have Owner access.'); await openDashboard(); } catch (error) { await supabase?.auth.signOut(); const text = /invalid login credentials|invalid.*password|email.*not confirmed/i.test(error.message || '') ? 'Incorrect email or password. Please check both fields and try again.' : (error.message || 'Unable to sign in.'); message('#login-message', text, true); } finally { button.disabled = false; } };
document.querySelectorAll('[data-owner-tab]').forEach(button => button.onclick = () => { activeTab = button.dataset.ownerTab; document.querySelectorAll('[data-owner-tab]').forEach(tab => tab.classList.toggle('active', tab === button)); render(); });
$('#clear-editor').onclick = () => renderForm();
$('#owner-editor').onsubmit = async event => { event.preventDefault(); const form = new FormData(event.target), id = form.get('id'), file = form.get('upload_file'), button = event.target.querySelector('[type=submit]'); form.delete('id'); form.delete('upload_file'); const values = Object.fromEntries(form); try { button.disabled = true; message('#editor-message', file?.size ? 'Uploading file…' : 'Saving…'); if (file?.size) { const url = await upload(file); if (activeTab === 'projects') values.image_url = url; if (activeTab === 'gallery') { values.media_url = url; values.media_type = file.type.startsWith('video/') ? 'video' : 'image'; } if (activeTab === 'team') values.photo_url = url; } if (activeTab === 'projects') { values.location = values.title; values.description = values.description || ''; } if (activeTab === 'gallery') { if (!values.media_url) throw new Error('Choose a file or enter a media URL.'); values.sort_order = Number(values.sort_order || 0); } const collection = activeTab === 'projects' ? 'projects' : activeTab === 'gallery' ? 'media' : 'team'; await api(`content/${collection}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) }); await loadContent(); renderForm(); message('#editor-message', 'Saved successfully.'); } catch (error) { message('#editor-message', error.message || 'Unable to save.', true); } finally { button.disabled = false; } };
$('#owner-sign-out').onclick = async () => { await supabase?.auth.signOut(); $('#owner-dashboard').hidden = true; $('#owner-login').hidden = false; $('#owner-login-form').reset(); message('#login-message'); };
window.addEventListener('error', event => message('#login-message', `Owner page error: ${event.message}`, true));
message('#login-message', supabase ? 'Ready to sign in.' : 'The secure sign-in service could not load. Check your internet connection and reopen this page.', !supabase);
if (supabase) supabase.auth.getSession().then(async ({ data: { session } }) => { if (session && await isOwner()) { $('#owner-login').hidden = true; $('#owner-dashboard').hidden = false; await loadContent(); } }).catch(error => message('#login-message', error.message || 'Unable to restore the owner session.', true));
})();
