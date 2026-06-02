import { app } from "electron";

import type { ActivationCompleteInput } from "./licenseTypes";

export const ACTIVATION_PROTOCOL = "kanvas";

export const registerActivationProtocol = (): void => {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(ACTIVATION_PROTOCOL, process.execPath, [process.argv[1]]);
    }
    return;
  }

  app.setAsDefaultProtocolClient(ACTIVATION_PROTOCOL);
};

export const parseActivationUrl = (rawUrl: string): ActivationCompleteInput | null => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${ACTIVATION_PROTOCOL}:` || url.hostname !== "activate") {
    return null;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return null;
  }

  return { code, state };
};
