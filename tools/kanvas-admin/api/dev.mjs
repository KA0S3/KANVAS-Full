import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./index.mjs";

const adminRoot = fileURLToPath(new URL("..", import.meta.url));
const viteBin = resolve(adminRoot, "../../node_modules/vite/bin/vite.js");
const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "4177"], {
  cwd: adminRoot,
  shell: true,
  stdio: "inherit",
});

process.on("SIGINT", () => {
  vite.kill("SIGINT");
  process.exit(0);
});
