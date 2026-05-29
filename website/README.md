# KANVAS Website

Standalone public website and account portal for `https://kanvas-it.com`.

This app is intentionally separate from the Electron desktop app. It handles marketing, Supabase auth, entitlement display, download access contracts, desktop activation contracts, and a tiny local-only browser demo.

The online demo stores content only in browser IndexedDB:

- 1 book
- 100 assets
- 2MB max file upload
- no generators
- no zip backup
- no project data in Supabase

## Development

```bash
npm install
npm run dev
```

## Production Environment

Set the required `VITE_*` values in a local `.env` file or in your hosting provider's environment settings:

```text
VITE_SITE_ORIGIN=https://kanvas-it.com
VITE_SITE_URL=https://kanvas-it.com
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_LICENSE_API_URL=https://<project-ref>.supabase.co/functions/v1
VITE_KANVAS_ACTIVATION_URL=https://kanvas-it.com/desktop/activate
```

Only public `VITE_*` values belong in this frontend. Never add Paystack secret keys, Supabase service-role keys, storage credentials, or license signing private keys to `website/`, Vercel frontend env vars, or any browser code.

## Supabase and Paystack Setup

1. Create or open the Supabase project for `kanvas-it.com`.
2. In Supabase, go to **Project Settings -> API** and copy:
   - Project URL into `VITE_SUPABASE_URL`
   - anon public key into `VITE_SUPABASE_ANON_KEY`
3. In Supabase, go to **Authentication -> URL Configuration** and set:
   - Site URL: `https://kanvas-it.com`
   - Redirect URLs:
     - `https://kanvas-it.com/**`
   - OAuth landing path used by this site: `https://kanvas-it.com/oauth/consent`
4. In Supabase, go to **Authentication -> Providers -> Google**:
   - Enable Google.
   - Add the Google OAuth client ID and secret.
   - In Google Cloud Console, add the Supabase callback URL shown by Supabase to the OAuth client's authorized redirect URIs.
5. Deploy the Supabase Edge Functions used by the website:
   - `paystack-initialize`
   - `desktop/download-access`
   - `desktop/activation/start`
6. Set Supabase Edge Function secrets:
   - `PAYSTACK_SECRET_KEY`
   - `STABLE_DOWNLOAD_URL=https://github.com/KA0S3/KANVAS/releases/latest/download/KANVAS-Setup.exe`
   - `GITHUB_RELEASE_REPO=KA0S3/KANVAS`
   - `BETA_DOWNLOAD_ASSET_NAME=KANVAS-Setup.exe`
   - optional `BETA_DOWNLOAD_URL` override if beta should not use GitHub prerelease lookup
7. In Paystack, set the payment callback/return URL to:
   - `https://kanvas-it.com/payment-success`
   - webhook URL: `https://hzngfqebklzhnwkcmgto.supabase.co/functions/v1/paystack-webhook`
   - cancellation/failure should return users to `https://kanvas-it.com/payment/cancelled` if your Paystack flow supports it.
8. The one-time Paystack product keys are `BETA_ACCESS`, `BETA_TO_STABLE_UPGRADE`, and `STABLE_FULL`. Do not configure Paystack subscriptions or plans for KANVAS.
9. The website never stores download URLs in public frontend env vars. Installer links come from the Supabase download-access function after entitlement checks.

For Vercel, set the same `VITE_*` values as project environment variables. Deploy only this `website/` folder as the website frontend.
