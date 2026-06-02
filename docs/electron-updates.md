# KANVAS Desktop Delivery

KANVAS desktop delivery uses Supabase licensing plus private Cloudflare R2 binaries, not GitHub Releases.

## Storage

- Private R2 bucket: `kanvas-desktop-releases`
  - `installers/<channel>/<version>/KANVAS-Setup.exe`
  - `updates/<channel>/KANVAS-Setup.exe`
  - `updates/<channel>/*.blockmap`
  - `updates/<channel>/latest.yml` or `updates/<channel>/beta.yml`
  - `updates/<channel>/update-manifest.json`
  - `manifests/<channel>/latest-installer.json`

The website requests short-lived download tokens from the `desktop` Edge Function. The function validates entitlement and redirects to signed R2 installer URLs. The desktop app validates license/device state through `/desktop/update-check`, receives a temporary generic feed URL, and downloads update artifacts through Supabase redirects to signed R2 URLs.

## Required Secrets

Local `.env.local` is now loaded by the release verification and R2 upload scripts. Shell or CI variables still take precedence.

Set these locally before uploading releases:

```powershell
$env:R2_ACCOUNT_ID="<cloudflare-account-id>"
$env:R2_ACCESS_KEY_ID="<r2-access-key-id>"
$env:R2_SECRET_ACCESS_KEY="<r2-secret-access-key>"
$env:R2_BUCKET_NAME="kanvas-desktop-releases"
```

Set these Supabase Edge Function secrets:

```powershell
npm exec supabase -- secrets set `
  R2_ACCOUNT_ID="<cloudflare-account-id>" `
  R2_ACCESS_KEY_ID="<r2-access-key-id>" `
  R2_SECRET_ACCESS_KEY="<r2-secret-access-key>" `
  R2_BUCKET_NAME="kanvas-desktop-releases" `
  DOWNLOAD_LINK_TTL_SECONDS="900" `
  UPDATE_LINK_TTL_SECONDS="900"
```

## Release Commands

Beta versions must use prerelease semver such as `0.4.0-beta.2`.

```powershell
npm run release:beta
```

Stable versions must use normal semver such as `1.0.0`.

```powershell
npm run release:stable
```

Each release command typechecks, runs release tests, builds the NSIS installer, verifies release artifacts, uploads installer/update artifacts to private R2, and updates the channel manifests. R2 objects must remain private.

## Promo Codes

Promo codes are existing `access_keys`. Create the key server-side with a SHA-256 hash in `access_keys.key_hash`, then give the raw code to the user once. Redemption through the website creates or updates an entitlement through the existing `redeem-key` function.
