const { version } = require("../../package.json");

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "app.kanvas.admin",
  productName: "KANVAS Admin",
  artifactName: "KANVAS-Admin-Setup.${ext}",
  icon: "public/KANVAS-LOGO-F3.png",
  directories: {
    output: "admin-release",
  },
  files: [
    "tools/kanvas-admin/api/**",
    "tools/kanvas-admin/dist/**",
    "tools/kanvas-admin/electron/**",
    "tools/kanvas-admin/package.json",
    "package.json",
  ],
  extraMetadata: {
    name: "kanvas-admin-desktop",
    version,
    main: "tools/kanvas-admin/electron/main.cjs",
  },
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
    shortcutName: "KANVAS Admin",
  },
};
