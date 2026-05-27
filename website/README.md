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

Copy `.env.example` to `.env` and set:

```text
VITE_SITE_ORIGIN=https://kanvas-it.com
VITE_SITE_URL=https://kanvas-it.com
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_LICENSE_API_URL=https://<project-ref>.supabase.co/functions/v1
VITE_KANVAS_ACTIVATION_URL=https://kanvas-it.com/desktop/activate
VITE_STABLE_DOWNLOAD_URL=
VITE_BETA_DOWNLOAD_URL=
```

Only the Supabase anon key belongs in this frontend. Never add service-role keys or license signing private keys.
