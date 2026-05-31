import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { expectedPublishChannel, inferReleaseChannel, validateReleaseConfig } from '../../scripts/release-rules.mjs';

const require = createRequire(import.meta.url);
const builderConfig = require('../../electron-builder.config.cjs');

const basePackage = {
  description: 'KANVAS desktop creative planning app',
  author: 'KA0S3',
};

const baseConfig = {
  appId: 'app.kanvas.desktop',
  productName: 'KANVAS',
  publish: [
    {
      provider: 'generic',
      url: 'https://example.supabase.co/storage/v1/object/public/desktop-updates/stable',
      channel: 'latest',
    },
  ],
};

describe('Electron release channel guards', () => {
  it('infers beta and stable channels from semver', () => {
    expect(inferReleaseChannel('0.4.0-beta.1')).toBe('beta');
    expect(expectedPublishChannel('0.4.0-beta.1')).toBe('beta');
    expect(inferReleaseChannel('1.0.0-beta.1')).toBe('beta');
    expect(expectedPublishChannel('1.0.0-beta.1')).toBe('beta');
    expect(inferReleaseChannel('1.0.0')).toBe('stable');
    expect(expectedPublishChannel('1.0.0')).toBe('latest');
  });

  it('accepts a stable release with latest publish metadata', () => {
    expect(validateReleaseConfig({
      version: '1.0.0',
      requestedChannel: 'stable',
      packageMetadata: basePackage,
      builderConfig: baseConfig,
    })).toEqual([]);
  });

  it('rejects beta release commands for stable versions', () => {
    const errors = validateReleaseConfig({
      version: '1.0.0',
      requestedChannel: 'beta',
      packageMetadata: basePackage,
      builderConfig: baseConfig,
    });

    expect(errors).toContain('Version 1.0.0 does not match requested beta release.');
    expect(errors).toContain('Beta releases must use prerelease semver like 1.0.0-beta.1.');
  });

  it('rejects stable release commands for beta versions', () => {
    const errors = validateReleaseConfig({
      version: '1.0.0-beta.1',
      requestedChannel: 'stable',
      packageMetadata: basePackage,
      builderConfig: {
        ...baseConfig,
        publish: [{ ...baseConfig.publish[0], url: 'https://example.supabase.co/storage/v1/object/public/desktop-updates/beta', channel: 'beta' }],
      },
    });

    expect(errors).toContain('Version 1.0.0-beta.1 does not match requested stable release.');
    expect(errors).toContain('Stable releases must use normal semver like 1.0.0.');
  });

  it('rejects publish channel mismatches', () => {
    const errors = validateReleaseConfig({
      version: '1.0.0-beta.1',
      requestedChannel: 'beta',
      packageMetadata: basePackage,
      builderConfig: {
        ...baseConfig,
        publish: [{ ...baseConfig.publish[0], url: 'https://example.supabase.co/storage/v1/object/public/desktop-updates/beta' }],
      },
    });

    expect(errors).toContain('Publish channel mismatch. Version 1.0.0-beta.1 expects beta, config has latest.');
  });

  it('uses the stable public installer asset name for release uploads', () => {
    expect(builderConfig.artifactName).toBe('KANVAS-Setup.${ext}');
  });

  it('keeps the current beta builder config on the generic beta update feed', () => {
    expect(builderConfig.detectUpdateChannel).toBe(false);
    expect(builderConfig.publish[0].provider).toBe('generic');
    expect(builderConfig.publish[0].url).toContain('/desktop-updates/beta');
    expect(builderConfig.publish[0].channel).toBe('beta');
    expect(builderConfig.generateUpdatesFilesForAllChannels).toBe(false);
  });
});
