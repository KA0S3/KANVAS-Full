# KANVAS Desktop Delivery

KANVAS desktop delivery uses Supabase, not GitHub Releases.

## Storage

- Private bucket: `desktop-installers`
  - `stable/<version>/KANVAS-Setup.exe`
  - `stable/latest-installer.json`
  - `beta/<version>/KANVAS-Setup.exe`
  - `beta/latest-installer.json`
- Public bucket: `desktop-updates`
  - `stable/latest.yml`
  - `stable/KANVAS-Setup.exe`
  - `stable/*.blockmap`
  - `beta/beta.yml`
  - `beta/KANVAS-Setup.exe`
  - `beta/*.blockmap`

The website requests short-lived download tokens from the `desktop` Edge Function. The function creates signed URLs for private installer files. The installed app uses the public generic update feed, then activation and heartbeat enforce actual product access.

## Required Secrets

Set these locally before uploading releases:

```powershell
$env:SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

Optional overrides:

```powershell
$env:DESKTOP_INSTALLER_BUCKET="desktop-installers"
$env:DESKTOP_UPDATE_BUCKET="desktop-updates"
$env:KANVAS_UPDATE_BASE_URL="https://<project-ref>.supabase.co/storage/v1/object/public/desktop-updates"
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

Each release command typechecks, runs release tests, builds the NSIS installer, verifies release artifacts, uploads the private installer, uploads the public updater feed, and updates the channel manifest.

## Promo Codes

Promo codes are existing `access_keys`. Create the key server-side with a SHA-256 hash in `access_keys.key_hash`, then give the raw code to the user once. Redemption through the website creates or updates an entitlement through the existing `redeem-key` function.
