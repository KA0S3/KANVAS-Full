const { spawn } = require("node:child_process");
const { join } = require("node:path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const bin = join(
  __dirname,
  "../node_modules/.bin",
  process.platform === "win32" ? "electron-vite.cmd" : "electron-vite",
);

const child = process.platform === "win32"
  ? spawn("cmd.exe", ["/d", "/c", bin, "dev"], {
      env,
      stdio: "inherit",
      shell: false,
    })
  : spawn(bin, ["dev"], {
      env,
      stdio: "inherit",
      shell: false,
    });


child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
