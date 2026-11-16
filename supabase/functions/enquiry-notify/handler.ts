// Enquiry intake: validate, rate limit, store, then notify by email and WhatsApp.
// Kept runtime-agnostic (Web Fetch API only) so it can be driven by Deno in
// production and by a Node mock server in tests.

import {
  buildEmail,
  buildWhatsApp,
  confirmationEmail,
  truncate,
  validateEnquiry,
  type Enquiry,
  type Meta
} from './format.ts';

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  OWNER_EMAIL: string;
  OWNER_WHATSAPP: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_ID: string;
  WHATSAPP_TEMPLATE: string;
  WHATSAPP_TEMPLATE_LANG?: string;
  RATE_LIMIT_SALT: string;
  ALLOWED_ORIGINS?: string;
  SITE_URL?: string;
  VISITOR_CONFIRMATIONS?: string;
};

export type Deps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

const CONTACT_FALLBACK = 'Please call +91 93985 77232.';
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MAX_BODY_BYTES = 16_000;
const RETRY_DELAYS = [800, 2000];

const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
};

function originAllowed(origin: string, env: Env): boolean {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  const allowed = configured.length
    ? configured
    : ['https://gcgw.co.in', 'https://www.gcgw.co.in', 'http://localhost:8123', 'http://127.0.0.1:8123'];
  return allowed.includes(origin);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(status: number, body: unknown, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(origin ? corsHeaders(origin) : {})
    }
  });
}

/** Provider text can echo a phone number back; keep digits out of logs and rows. */
function safeReason(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\d{7,}/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(text, 180) || 'unknown error';
}

function apiBase(env: Env): string {
  return String(env.SUPABASE_URL || '').replace(/\/+$/, '');
}

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };
}

function requestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

/** HMAC keeps raw IP addresses out of the database. */
async function hashIp(ip: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(ip));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function providerMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const body = JSON.parse(text);
    const detail = body?.error?.message || body?.error?.description || body?.message || body?.error;
    return `${response.status} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  } catch {
    return `${response.status} ${text.slice(0, 160)}`;
  }
}

async function withRetries(
  deps: Deps,
  send: () => Promise<Response>
): Promise<{ ok: boolean; detail: string }> {
  let detail = '';
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await send();
      if (response.ok) return { ok: true, detail: 'sent' };
      detail = await providerMessage(response);
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      if (permanent) break;
    } catch (error) {
      detail = safeReason(error instanceof Error ? error.message : error);
    }
    if (attempt < RETRY_DELAYS.length) await deps.sleep(RETRY_DELAYS[attempt]);
  }
  return { ok: false, detail: `failed: ${safeReason(detail)}` };
}

async function sendEmail(
  env: Env,
  deps: Deps,
  message: { to: string; subject: string; html: string; text: string; replyTo?: string | null }
): Promise<{ ok: boolean; detail: string }> {
  const from = env.RESEND_FROM || 'GCGW Website <info@gcgw.co.in>';
  return withRetries(deps, () => deps.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {})
    })
  }));
}

async function sendWhatsApp(
  env: Env,
  deps: Deps,
  params: string[]
): Promise<{ ok: boolean; detail: string }> {
  const owner = String(env.OWNER_WHATSAPP || '').replace(/\D/g, '');
  const to = owner.length === 10 ? `91${owner}` : owner;
  if (!to || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID || !env.WHATSAPP_TEMPLATE) {
    return { ok: false, detail: 'failed: WhatsApp secrets are not configured' };
  }
  const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_ID}/messages`;
  return withRetries(deps, () => deps.fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: env.WHATSAPP_TEMPLATE,
        language: { code: env.WHATSAPP_TEMPLATE_LANG || 'en' },
        components: [{
          type: 'body',
          parameters: params.map(text => ({ type: 'text', text }))
        }]
      }
    })
  }));
}

async function reserveRateSlot(env: Env, deps: Deps, ipHash: string): Promise<'ok' | 'limited' | 'unavailable'> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const countResponse = await deps.fetch(
    `${apiBase(env)}/rest/v1/enquiry_rate?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(since)}`,
    { headers: serviceHeaders(env) }
  ).catch(() => null);
  if (!countResponse || !countResponse.ok) return 'unavailable';
  const rows = await countResponse.json().catch(() => null);
  if (!Array.isArray(rows)) return 'unavailable';
  if (rows.length >= RATE_LIMIT_MAX) return 'limited';
  const insert = await deps.fetch(`${apiBase(env)}/rest/v1/enquiry_rate`, {
    method: 'POST',
    headers: { ...serviceHeaders(env), Prefer: 'return=minimal' },
    body: JSON.stringify({ ip_hash: ipHash })
  }).catch(() => null);
  if (!insert || !insert.ok) return 'unavailable';
  return 'ok';
}

type StoredRow = { id: string; ref: string; created_at: string };

async function storeEnquiry(env: Env, deps: Deps, enquiry: Enquiry): Promise<StoredRow | null> {
  const response = await deps.fetch(
    `${apiBase(env)}/rest/v1/enquiries?select=id,ref,created_at`,
    {
      method: 'POST',
      headers: { ...serviceHeaders(env), Prefer: 'return=representation' },
      body: JSON.stringify({
        name: enquiry.name,
        phone: enquiry.phone,
        email: enquiry.email,
        location: enquiry.location,
        service: enquiry.service,
        property_type: enquiry.property_type,
        preferred_date: enquiry.preferred_date,
        message: enquiry.message,
        source_page: enquiry.source_page,
        device: enquiry.device,
        status: 'new'
      })
    }
  ).catch(() => null);
  if (!response || !response.ok) return null;
  const rows = await response.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.id || !row?.ref) return null;
  return { id: String(row.id), ref: String(row.ref), created_at: String(row.created_at || new Date().toISOString()) };
}

async function recordDelivery(
  env: Env,
  deps: Deps,
  id: string,
  email: string,
  whatsapp: string
): Promise<void> {
  await deps.fetch(`${apiBase(env)}/rest/v1/enquiries?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(env), Prefer: 'return=minimal' },
    body: JSON.stringify({ email_status: email, whatsapp_status: whatsapp })
  }).catch(() => null);
}

async function notifyOwner(
  env: Env,
  deps: Deps,
  enquiry: Enquiry,
  meta: Meta
): Promise<{ email: { ok: boolean; detail: string }; whatsapp: { ok: boolean; detail: string } }> {
  const email = buildEmail(enquiry, meta);
  const whatsapp = buildWhatsApp(enquiry, meta);
  const [emailResult, whatsappResult] = await Promise.all([
    sendEmail(env, deps, {
      to: env.OWNER_EMAIL,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: enquiry.email
    }),
    sendWhatsApp(env, deps, whatsapp.params)
  ]);
  return { email: emailResult, whatsapp: whatsappResult };
}

async function sendVisitorConfirmation(
  env: Env,
  deps: Deps,
  enquiry: Enquiry,
  ref: string
): Promise<void> {
  if (!enquiry.email || env.VISITOR_CONFIRMATIONS === 'off') return;
  const message = confirmationEmail(ref);
  await sendEmail(env, deps, {
    to: enquiry.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: env.OWNER_EMAIL
  }).catch(() => null);
}

export async function handle(
  request: Request,
  env: Env,
  overrides: Partial<Deps> = {}
): Promise<Response> {
  const deps: Deps = { ...defaultDeps, ...overrides };
  const origin = request.headers.get('origin') || '';
  const cors = origin && originAllowed(origin, env) ? origin : undefined;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors ? corsHeaders(cors) : { Vary: 'Origin' } });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, cors);

  const raw = await request.text().catch(() => '');
  if (!raw) return json(400, { error: 'Send the enquiry as JSON.' }, cors);
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: `The enquiry is too long. ${CONTACT_FALLBACK}` }, cors);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Send the enquiry as JSON.' }, cors);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'Send the enquiry as JSON.' }, cors);
  }

  // The honeypot answers like a success without writing anything. No timing
  // gate: browser autofill can submit a genuine form quickly.
  const trapTriggered = String(body.company ?? '').trim().length > 0;
  const validated = validateEnquiry(body);
  if (trapTriggered) {
    return json(200, {
      ok: true,
      ref: null,
      created_at: new Date().toISOString(),
      email: 'sent',
      whatsapp: 'sent'
    }, cors);
  }
  if (!validated.ok || !validated.value) {
    return json(400, { error: 'Please check the highlighted fields.', fields: validated.errors }, cors);
  }
  const enquiry = validated.value;

  let ipHash = '';
  if (env.RATE_LIMIT_SALT) {
    ipHash = await hashIp(requestIp(request), env.RATE_LIMIT_SALT);
    const slot = await reserveRateSlot(env, deps, ipHash);
    if (slot === 'limited') {
      return json(429, { error: `Too many enquiries from this connection. ${CONTACT_FALLBACK}` }, cors);
    }
    if (slot === 'unavailable') {
      console.error('enquiry-notify: rate limit store unavailable; continuing without a slot');
    }
  }

  const stored = await storeEnquiry(env, deps, enquiry);
  if (!stored) {
    return json(500, { error: `We could not save your enquiry. ${CONTACT_FALLBACK}` }, cors);
  }

  const meta: Meta = { ref: stored.ref, createdAt: stored.created_at };
  const delivery = await notifyOwner(env, deps, enquiry, meta);

  await recordDelivery(
    env,
    deps,
    stored.id,
    delivery.email.ok ? 'sent' : delivery.email.detail,
    delivery.whatsapp.ok ? 'sent' : delivery.whatsapp.detail
  );

  if (!delivery.email.ok || !delivery.whatsapp.ok) {
    // Ref only: no phone number or message body in the logs.
    console.error(
      `enquiry-notify: ${stored.ref} email=${delivery.email.ok ? 'sent' : 'failed'} whatsapp=${delivery.whatsapp.ok ? 'sent' : 'failed'} ${delivery.email.ok ? '' : safeReason(delivery.email.detail)} ${delivery.whatsapp.ok ? '' : safeReason(delivery.whatsapp.detail)}`.trim()
    );
  }

  await sendVisitorConfirmation(env, deps, enquiry, stored.ref);

  return json(201, {
    ok: true,
    ref: stored.ref,
    created_at: stored.created_at,
    email: delivery.email.ok ? 'sent' : 'failed',
    whatsapp: delivery.whatsapp.ok ? 'sent' : 'failed'
  }, cors);
}
