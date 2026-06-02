const { version, description, author } = require("./package.json");

const isBeta = /-beta\.\d+$/i.test(version);
const channel = isBeta ? "beta" : "latest";
const updateChannelPath = isBeta ? "beta" : "stable";
const updateBaseUrl = (process.env.KANVAS_UPDATE_BASE_URL || "https://updates.invalid/kanvas").replace(/\/+$/, "");

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "app.kanvas.desktop",
  productName: "KANVAS",
  copyright: "Copyright © 2026 KA0S3",
  artifactName: "KANVAS-Setup.${ext}",
  icon: "public/KANVAS-LOGO-F3.png",
  detectUpdateChannel: false,
  generateUpdatesFilesForAllChannels: false,
  toolsets: {
    winCodeSign: "1.1.0",
  },
  directories: {
    output: "release",
  },
  files: [
    "dist/**",
    "out/**",
    "package.json",
  ],
  extraMetadata: {
    description,
    author,
  },
  protocols: [
    {
      name: "KANVAS Activation",
      schemes: ["kanvas"],
    },
  ],
  publish: [
    {
      provider: "generic",
      url: `${updateBaseUrl}/${updateChannelPath}`,
      channel,
    },
  ],
  win: {
    icon: "public/KANVAS-LOGO-F3.png",
    signAndEditExecutable: false,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "KANVAS",
  },
};
