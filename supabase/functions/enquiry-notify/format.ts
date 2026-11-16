// Pure helpers for the enquiry notification function.
// No Deno or network calls live here, so this file is unit-testable with Node.

export const SERVICES = [
  'Guniting',
  'Structural repairs',
  'Concrete rehabilitation',
  'Grouting & crack treatment',
  'Specialised civil works',
  'Soil anchoring',
  'Sand blasting work',
  'Painting of MS structures',
  'Not sure / general enquiry'
];

export const PROPERTY_TYPES = ['Housing society', 'Commercial', 'Industrial', 'Other'];
export const STATUS_VALUES = ['new', 'contacted', 'site_visited', 'quoted', 'closed'];

export type FieldErrors = Record<string, string>;

export type Enquiry = {
  name: string;
  phone: string;
  email: string | null;
  location: string | null;
  service: string;
  property_type: string | null;
  preferred_date: string | null;
  message: string;
  source_page: string | null;
  device: 'mobile' | 'tablet' | 'desktop';
};

export type Meta = {
  ref: string;
  createdAt: string;
};

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function truncate(value: string, max: number): string {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

/** Accepts 9876543210, 919876543210, +91 98765 43210. Returns +91XXXXXXXXXX or ''. */
export function normalisePhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : '';
}

export function displayPhone(e164: string): string {
  const digits = String(e164 || '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : e164;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function deviceFromUserAgent(ua: string): 'mobile' | 'tablet' | 'desktop' {
  const value = String(ua || '').toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(value)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(value)) return 'mobile';
  return 'desktop';
}

function istDateParts(value: Date): { iso: string; stamp: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(value);
  const stamp = `${new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric'
  }).format(value)}, ${new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
  }).format(value)} IST`;
  return { iso, stamp };
}

export function istStamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : istDateParts(date).stamp;
}

export function validateEnquiry(raw: Record<string, unknown>, now: Date = new Date()): {
  ok: boolean;
  errors: FieldErrors;
  value?: Enquiry;
} {
  const errors: FieldErrors = {};
  const name = cleanText(raw.name, 120);
  const phone = normalisePhone(raw.phone);
  const emailText = cleanText(raw.email, 160);
  const location = cleanText(raw.location, 120);
  const service = cleanText(raw.service, 120);
  const property = cleanText(raw.property_type, 40);
  const dateText = cleanText(raw.preferred_date, 10);
  const message = String(raw.message ?? raw.requirement ?? '').replace(CONTROL, ' ').trim().slice(0, 2000);
  const page = cleanText(raw.source_page, 60);
  const label = cleanText(raw.source_label, 40);
  const device = deviceFromUserAgent(String(raw.user_agent || ''));
  const today = istDateParts(now).iso;

  if (name.length < 2) errors.name = 'Enter your name.';
  if (!phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
  if (emailText && !isValidEmail(emailText)) errors.email = 'Check the email address or leave it blank.';
  if (!SERVICES.includes(service)) errors.service = 'Choose the service you need.';
  if (message.length < 10) errors.message = 'Add at least 10 characters about the work.';
  if (property && !PROPERTY_TYPES.includes(property)) errors.property_type = 'Choose a property type.';

  let preferred: string | null = null;
  if (dateText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || Number.isNaN(new Date(`${dateText}T00:00:00Z`).getTime())) {
      errors.preferred_date = 'Enter a valid date.';
    } else if (dateText < today) {
      errors.preferred_date = 'Choose today or a later date.';
    } else if (dateText > istDateParts(new Date(now.getTime() + 400 * 86400000)).iso) {
      errors.preferred_date = 'Choose a date within the next year.';
    } else {
      preferred = dateText;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const sourcePage = [page, label].filter(Boolean).join(' · ').slice(0, 100) || null;
  return {
    ok: true,
    errors,
    value: {
      name,
      phone,
      email: emailText || null,
      location: location || null,
      service,
      property_type: property || null,
      preferred_date: preferred,
      message,
      source_page: sourcePage,
      device
    }
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char] as string));
}

function multiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function buildEmail(enquiry: Enquiry, meta: Meta): { subject: string; html: string; text: string } {
  const location = enquiry.location || 'not given';
  const property = enquiry.property_type || 'not given';
  const preferred = enquiry.preferred_date || 'Any';
  const email = enquiry.email || 'not given';
  const received = istStamp(meta.createdAt);
  const source = enquiry.source_page || '/';
  const subject = `New site inspection request: ${enquiry.name}, ${location} (${enquiry.service})`;

  const rows: Array<[string, string]> = [
    ['Ref', meta.ref],
    ['Received', received],
    ['Name', enquiry.name],
    ['Phone', displayPhone(enquiry.phone)],
    ['Email', email],
    ['Project location', location],
    ['Service needed', enquiry.service],
    ['Property type', property],
    ['Preferred inspection date', preferred]
  ];

  const text = [
    'New Site Inspection Request',
    `Ref: ${meta.ref}   Received: ${received}`,
    `Name: ${enquiry.name}`,
    `Phone: ${displayPhone(enquiry.phone)} (tap to call)`,
    `Email: ${email}`,
    `Project location: ${location}`,
    `Service needed: ${enquiry.service}`,
    `Property type: ${property}`,
    `Preferred inspection date: ${preferred}`,
    `Requirement: ${enquiry.message}`,
    `Source: Website - ${source} (${enquiry.device})`
  ].join('\n');

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#26282b;max-width:640px">
  <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:18px;margin:0 0 14px">New Site Inspection Request</h1>
  <p style="margin:0 0 14px"><strong>Ref:</strong> ${escapeHtml(meta.ref)} &nbsp;&nbsp; <strong>Received:</strong> ${escapeHtml(received)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px">
${rows.map(([label, value]) => {
    let cell = escapeHtml(value);
    if (label === 'Phone') cell = `<a href="tel:${escapeHtml(enquiry.phone)}" style="color:#9c3b2e">${escapeHtml(value)}</a> (tap to call)`;
    if (label === 'Email' && enquiry.email) cell = `<a href="mailto:${escapeHtml(enquiry.email)}" style="color:#9c3b2e">${escapeHtml(value)}</a>`;
    return `    <tr><td style="padding:3px 18px 3px 0;color:#5c6164;white-space:nowrap">${escapeHtml(label)}</td><td>${cell}</td></tr>`;
  }).join('\n')}
  </table>
  <p style="margin:0 0 16px"><strong>Requirement:</strong><br>${multiline(enquiry.message)}</p>
  <p style="margin:0;color:#5c6164">Source: Website - ${escapeHtml(source)} (${escapeHtml(enquiry.device)})</p>
</div>`;

  return { subject, html, text };
}

/** Meta template parameters, in the order the approved template expects them. */
export function buildWhatsApp(enquiry: Enquiry, meta: Meta): {
  params: string[];
  fallbackText: string;
  replyUrl: string;
} {
  const location = enquiry.location || 'not given';
  const property = enquiry.property_type || 'not given';
  const preferred = enquiry.preferred_date || 'Any';
  const received = istStamp(meta.createdAt);
  const replyUrl = `https://wa.me/${enquiry.phone.replace(/\D/g, '')}`;

  const params = [
    meta.ref,
    enquiry.name,
    displayPhone(enquiry.phone),
    location,
    enquiry.service,
    property,
    preferred,
    truncate(enquiry.message.replace(/\s+/g, ' '), 300),
    received,
    replyUrl
  ].map(value => value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim());

  const fallbackText = [
    '*New Site Inspection Request*',
    `Ref: ${meta.ref}`,
    `*Name:* ${enquiry.name}`,
    `*Phone:* ${displayPhone(enquiry.phone)}`,
    `*Location:* ${location}`,
    `*Service:* ${enquiry.service}`,
    `*Property:* ${property}`,
    `*Preferred date:* ${preferred}`,
    `*Requirement:* ${enquiry.message}`,
    `Received: ${received}`,
    `Reply: ${replyUrl}`
  ].join('\n');

  return { params, fallbackText, replyUrl };
}

export function buildWhatsAppFallbackUrl(ownerDigits: string, fallbackText: string): string {
  return `https://wa.me/${String(ownerDigits).replace(/\D/g, '')}?text=${encodeURIComponent(fallbackText)}`;
}

export function confirmationEmail(ref: string): { subject: string; text: string; html: string } {
  const line = `We've received your request (Ref ${ref}). We'll contact you shortly.`;
  return {
    subject: `We've received your request (Ref ${ref})`,
    text: `${line}\n\nGopal Chavan Guniting Work (GCGW)\n+91 93985 77232`,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#26282b">
  <p style="margin:0 0 14px">We've received your request (Ref ${escapeHtml(ref)}). We'll contact you shortly.</p>
  <p style="margin:0;color:#5c6164">Gopal Chavan Guniting Work (GCGW)<br><a href="tel:+919398577232" style="color:#9c3b2e">+91 93985 77232</a></p>
</div>`
  };
}
