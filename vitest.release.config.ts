import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/test/electron-release-rules.test.ts",
      "src/test/download-release-resolution.test.ts",
      "src/test/electron-project-filesystem.test.ts",
      "src/test/local-persistence-stores.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
