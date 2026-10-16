import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const environment = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase server configuration is missing.');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};
async function requireAdmin(event, db) {
  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new Error('Your session is not valid.');
  const { data: profile, error: profileError } = await db.from('profiles').select('is_admin').eq('id', user.id).single();
  if (profileError || !profile?.is_admin) throw new Error('You are not authorised to manage site content.');
}
export async function handler(event) {
  try {
    const db = environment();
    const path = event.path.replace('/.netlify/functions/content', '').replace(/^\//, '');
    if (event.httpMethod === 'GET' && !path) {
      const [{ data: projects, error: projectError }, { data: team, error: teamError }] = await Promise.all([
        db.from('projects').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
        db.from('team_members').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false })
      ]);
      if (projectError || teamError) throw projectError || teamError;
      return json(200, { projects, team });
    }
    await requireAdmin(event, db);
    const [collection, id] = path.split('/');
    const table = collection === 'projects' ? 'projects' : collection === 'team' ? 'team_members' : null;
    if (!table) return json(404, { error: 'Not found.' });
    if (event.httpMethod === 'POST') {
      const { data, error } = await db.from(table).insert(JSON.parse(event.body || '{}')).select().single();
      if (error) throw error;
      return json(201, data);
    }
    if (event.httpMethod === 'PUT' && id) {
      const { data, error } = await db.from(table).update(JSON.parse(event.body || '{}')).eq('id', id).select().single();
      if (error) throw error;
      return json(200, data);
    }
    if (event.httpMethod === 'DELETE' && id) {
      const { error } = await db.from(table).delete().eq('id', id);
      if (error) throw error;
      return json(200, { ok: true });
    }
    return json(405, { error: 'Method not allowed.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed.';
    const accessError = /sign in|required|session|authorised/i.test(message);
    return json(accessError ? 401 : 500, { error: message });
  }
}
