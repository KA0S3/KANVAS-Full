export function inferReleaseChannel(version) {
  return /-beta\.\d+$/i.test(version) ? "beta" : "stable";
}

export function expectedPublishChannel(version) {
  return inferReleaseChannel(version) === "beta" ? "beta" : "latest";
}

export function validateReleaseConfig({
  version,
  requestedChannel,
  packageMetadata,
  builderConfig,
  configExists = true,
}) {
  const errors = [];
  const isBetaVersion = /-beta\.\d+$/i.test(version);
  const isStableVersion = /^\d+\.\d+\.\d+$/.test(version);
  const expectedChannel = inferReleaseChannel(version);
  const publishChannel = builderConfig.publish?.[0]?.channel;

  if (requestedChannel && !["beta", "stable"].includes(requestedChannel)) {
    errors.push(`Unknown release channel "${requestedChannel}". Use "beta" or "stable".`);
  }

  if (requestedChannel && requestedChannel !== expectedChannel) {
    errors.push(`Version ${version} does not match requested ${requestedChannel} release.`);
  }

  if (requestedChannel === "beta" && !isBetaVersion) {
    errors.push("Beta releases must use prerelease semver like 1.0.0-beta.1.");
  }

  if (requestedChannel === "stable" && !isStableVersion) {
    errors.push("Stable releases must use normal semver like 1.0.0.");
  }

  if (!builderConfig.appId || !builderConfig.productName || !packageMetadata.description || !packageMetadata.author) {
    errors.push("Product metadata is incomplete. appId, productName, description, and author are required.");
  }

  if (!Array.isArray(builderConfig.publish) || builderConfig.publish.length === 0) {
    errors.push("electron-builder publish config is missing.");
  } else {
    const publish = builderConfig.publish[0];
    for (const key of ["provider", "url", "channel"]) {
      if (!publish[key]) {
        errors.push(`electron-builder publish config is missing "${key}".`);
      }
    }
    if (publish.provider !== "generic") {
      errors.push(`electron-builder publish provider must be "generic", config has "${publish.provider}".`);
    }
    if (publish.url && !String(publish.url).includes(`/desktop-updates/${expectedChannel}`)) {
      errors.push(`Generic update URL must point at the ${expectedChannel} desktop-updates path.`);
    }
  }

  if (publishChannel !== expectedPublishChannel(version)) {
    errors.push(`Publish channel mismatch. Version ${version} expects ${expectedPublishChannel(version)}, config has ${publishChannel}.`);
  }

  if (!configExists) {
    errors.push("electron-builder.config.cjs is missing.");
  }

  return errors;
}
