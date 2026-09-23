# GCGW professional site

This is a calm, responsive public GCGW website with an owner-only content dashboard. Visitors can view the site normally; only an authenticated Supabase user marked as an admin can add, edit, or delete projects and team members.

## What is included

- No preloader, custom cursor, GSAP, parallax, or scroll-reveal effects. The visual design uses only native, subtle CSS transitions.
- A top-right **Owner login** button, hidden admin-management shortcut after authorisation, and editable project/team content.
- Secure data mutations through Netlify Functions. The Supabase **service role key stays only in Netlify**.
- Mobile-number recovery UI using Supabase Phone Auth. No OTP, password, phone number, or secret is in frontend code.
- Current GCGW wording, contacts, branding palette, and fallback project/team content.

## Before deploying

1. Copy the existing image files (`img 10.jpeg`, `img 11.jpeg`, `img 12.jpeg`, `img 13.jpeg`, and `logo1.jpeg`) into this folder. Replace them later with compressed WebP/JPEG images if possible.
2. Create a Supabase project. In its SQL editor, run `supabase-schema.sql`.
3. In Supabase Authentication, create your owner account using email/password. Copy its user UUID into the commented `profiles` insert in `supabase-schema.sql`, then run that insert. Nobody else becomes an admin unless you explicitly set `is_admin` to true.
4. Configure phone authentication in **Supabase Dashboard → Authentication → Providers → Phone**. Add an SMS provider (Twilio, MessageBird, or another supported provider), enable production phone confirmation, and add your site domain to the allowed redirect/domain settings. Supabase then sends the OTP—this project never handles or stores it.
5. In `config.js`, replace the two blank values with the Supabase project URL and **anon/public key**. These are safe to expose.
6. In Netlify → Site configuration → Environment variables, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never add the service-role key to `index.html`, Git, or a client-side config file.
7. Deploy this folder to Netlify. Netlify detects `netlify.toml`; run `npm install` during build so the functions receive `@supabase/supabase-js`.

## Local test

Install Node 18+ and the Netlify CLI, then run `npm install` followed by `netlify dev`. Test public viewing, owner sign-in, adding/editing/deleting both content types, and phone recovery with a real configured test number.

## Security notes

The database functions validate the signed-in user token and then verify `profiles.is_admin` before any create, update, or delete. Public data is readable, as a company website requires. Keep the Supabase dashboard and Netlify account protected with strong passwords and MFA.
