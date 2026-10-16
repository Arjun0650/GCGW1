import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!token || !url || !serviceKey) return { statusCode: 401, body: JSON.stringify({ isAdmin: false }) };
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return { statusCode: 401, body: JSON.stringify({ isAdmin: false }) };
    const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).single();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isAdmin: Boolean(profile?.is_admin) }) };
  } catch {
    return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isAdmin: false }) };
  }
}
