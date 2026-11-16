// Supabase Edge Function entry point. Deploy with the Supabase CLI:
//   supabase functions deploy enquiry-notify --no-verify-jwt
// Secrets live in Supabase → Edge Functions → Secrets, never in this repo.

import { handle } from './handler.ts';
import type { Env } from './handler.ts';

Deno.serve(request => handle(request, Deno.env.toObject() as unknown as Env));
