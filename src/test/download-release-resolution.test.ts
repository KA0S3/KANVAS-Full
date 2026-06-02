import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopFunctionSource = () => readFileSync(resolve('supabase/functions/desktop/index.ts'), 'utf8');
const uploadScriptSource = () => readFileSync(resolve('scripts/upload-r2-release.mjs'), 'utf8');

describe('private desktop download and update delivery', () => {
  it('uses one private R2 bucket layout for installers, updates, and manifests', () => {
    const source = uploadScriptSource();

    expect(source).toContain('kanvas-desktop-releases');
    expect(source).toContain('installers/${channel}/${version}/KANVAS-Setup.exe');
    expect(source).toContain('updates/${channel}/KANVAS-Setup.exe');
    expect(source).toContain('updates/${channel}/update-manifest.json');
    expect(source).toContain('manifests/${channel}/latest-installer.json');
  });

  it('keeps R2 signing in the Supabase desktop function only', () => {
    const source = desktopFunctionSource();

    expect(source).toContain('R2_ACCOUNT_ID');
    expect(source).toContain('R2_ACCESS_KEY_ID');
    expect(source).toContain('R2_SECRET_ACCESS_KEY');
    expect(source).toContain('R2_BUCKET_NAME');
    expect(source).toContain('Response.redirect(await r2SignedUrl');
  });

  it('exposes gated update-check, feed, and artifact routes', () => {
    const source = desktopFunctionSource();

    expect(source).toContain('path === "/update-check"');
    expect(source).toContain('path === "/update-feed"');
    expect(source).toContain('path === "/update-artifact"');
    expect(source).toContain('desktop_update_tokens');
    expect(source).toContain('update_token_expired');
  });
});
