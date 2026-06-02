import js from "@eslint/js";
import globals from "globals";
import kanvasAntiPatterns from "./eslint-plugins/kanvas-anti-patterns.js";

export default [
  { ignores: [
    "dist", 
    "node_modules", 
    "**/*.test.ts", 
    "**/*.test.tsx",
    "tailwind.config.ts",
    "vite.config.ts",
    "vitest.config.ts",
    "eslint.config.js"
  ] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      "kanvas-anti-patterns": kanvasAntiPatterns,
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // KANVAS anti-pattern rules (critical for architectural integrity)
      "kanvas-anti-patterns/no-forbidden-fields": "error",
      "kanvas-anti-patterns/no-direct-localstorage": "error",
      "kanvas-anti-patterns/no-embedded-files": "error",
      "kanvas-anti-patterns/no-sync-state-pollution": "error",
      "kanvas-anti-patterns/no-ui-state-pollution": "error",
      "kanvas-anti-patterns/no-behavior-branching": "warn",
      "kanvas-anti-patterns/no-full-project-reload": "error",
      "kanvas-anti-patterns/no-conditional-schema": "error",
      "kanvas-anti-patterns/require-zone-separation": "error",
      "kanvas-anti-patterns/no-asset-type-branching": "error",
      "kanvas-anti-patterns/no-sync-state-in-assets": "error",
      "kanvas-anti-patterns/require-canonical-structure": "error",
    },
  },
  {
    files: ["eslint-plugins/**"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "kanvas-anti-patterns/no-forbidden-fields": "off", // Allow in tests for testing violations
    },
  },
];
