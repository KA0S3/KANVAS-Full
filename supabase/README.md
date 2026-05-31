# KANVAS-Auth Supabase Backend

This folder owns only KANVAS account, payment, entitlement, activation, access-key, audit, and heartbeat state. It must not store project folders, assets, editor state, autosaves, or user-created work.

## Project Setup

Preferred region is `eu-west-1`. Use `us-east-1` only if `eu-west-1` is unavailable for the org/project flow.

```sh
npm exec supabase -- login
npm exec supabase -- projects list
npm exec supabase -- projects create KANVAS-Auth --org-id <ORG_ID> --db-password <STRONG_DB_PASSWORD> --region <REGION>
npm exec supabase -- link --project-ref <PROJECT_REF>
npm exec supabase -- db push
```

If CLI project creation is unavailable, create the project in the Supabase dashboard instead:

1. Open Supabase dashboard and create a new project named `KANVAS-Auth`.
2. Pick `eu-west-1` if available, otherwise `us-east-1`.
3. Save the project ref, anon key, and service role key securely.
4. Run `npm exec supabase -- link --project-ref <PROJECT_REF>`.
5. Run `npm exec supabase -- db push`.

## Function Deploy

```sh
npm exec supabase -- functions deploy paystack-initialize
npm exec supabase -- functions deploy paystack-webhook
npm exec supabase -- functions deploy desktop
npm exec supabase -- functions deploy redeem-key
npm exec supabase -- functions deploy license-admin
```

The direct function root is:

```text
https://<project-ref>.supabase.co/functions/v1
```

The production Paystack webhook URL is:

```text
https://hzngfqebklzhnwkcmgto.supabase.co/functions/v1/paystack-webhook
```

## Secrets

```sh
npm exec supabase -- secrets set PAYSTACK_SECRET_KEY=<paystack-secret>
npm exec supabase -- secrets set KANVAS_LICENSE_PRIVATE_JWK='<ed25519-private-jwk>'
npm exec supabase -- secrets set KANVAS_LICENSE_PUBLIC_KEY_PEM='<public-key-pem>'
npm exec supabase -- secrets set SITE_URL=https://www.kanvas-it.com
npm exec supabase -- secrets set APP_DEEP_LINK_SCHEME=kanvas://activate
npm exec supabase -- secrets set ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://www.kanvas-it.com,https://kanvas-it.com
npm exec supabase -- secrets set DESKTOP_INSTALLER_BUCKET=desktop-installers
npm exec supabase -- secrets set DOWNLOAD_TOKEN_TTL_SECONDS=600
npm exec supabase -- secrets set STABLE_DESKTOP_AVAILABLE=false
```

Only the public key goes to Electron. Never place `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, or `KANVAS_LICENSE_PRIVATE_JWK` in the website or Electron app.

Paystack must use one-time transaction initialize only. The callback URL is `https://www.kanvas-it.com/payment-success`; do not configure KANVAS as a Paystack subscription or plan. Checkout is charged in ZAR.

The `desktop/download-access` function reads `latest-installer.json` from the private `desktop-installers` bucket and returns short-lived token URLs. Release uploads are handled by `npm run release:beta` and `npm run release:stable` from the repo root.

## Website Environment

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_SITE_URL=https://www.kanvas-it.com
VITE_SITE_ORIGIN=https://www.kanvas-it.com
VITE_LICENSE_API_URL=https://<project-ref>.supabase.co/functions/v1
VITE_KANVAS_ACTIVATION_URL=https://www.kanvas-it.com/desktop/activate
```

## Electron Environment

```text
KANVAS_ACTIVATION_URL=https://www.kanvas-it.com/desktop/activate
KANVAS_LICENSE_API_URL=https://<project-ref>.supabase.co/functions/v1
KANVAS_LICENSE_PUBLIC_KEY_PEM=-----BEGIN PUBLIC KEY-----...
```

## Google Auth

Do not fake Google auth in code. Configure it in Google Cloud and Supabase:

1. Create a Google OAuth client in Google Cloud Console.
2. Add the Supabase callback URL from Supabase Auth provider settings.
3. Paste the Google client ID and secret into Supabase Auth provider settings.
4. Add redirect URLs:
   - `http://localhost:5173/**`
   - `http://localhost:3000/**`
   - `https://www.kanvas-it.com/**`
   - `https://kanvas-it.com/**`

## Verification

```sh
npm exec supabase -- db lint
npm exec supabase -- db push
```

Then verify payment, activation, heartbeat, device eviction, revoked entitlement lockout, and that no Supabase table stores KANVAS project data or assets.
