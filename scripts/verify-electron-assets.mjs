import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const projectRoot = process.cwd();
const distDir = resolve(projectRoot, "dist");
const outDir = resolve(projectRoot, "out");
const htmlPath = join(distDir, "index.html");

const requiredFiles = [
  htmlPath,
  join(outDir, "main", "index.cjs"),
  join(outDir, "preload", "index.cjs"),
  join(distDir, "kaos-smoke.png"),
  join(distDir, "KANVAS-LOGO-F3.png"),
  join(distDir, "pedestal-dark.png"),
  join(distDir, "pedestal-light.png"),
  join(distDir, "generators", "battle-manager.html"),
  join(distDir, "generators", "character-generator.html"),
  join(distDir, "generators", "city-generator.html"),
  join(distDir, "generators", "god-generator.html"),
];

const requiredBundledAssetPrefixes = [
  "BG-light-",
  "cosmic-background-",
  "pedestal-dark-",
  "pedestal-light-",
  "Splash-i-",
  "Black_book-",
  "Blue_book-",
  "brown_book-",
  "Green_book-",
  "purple_book-",
  "White_book-",
];

const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));
const distAssetsDir = join(distDir, "assets");
const distAssets = existsSync(distAssetsDir) ? readdirSync(distAssetsDir) : [];
const missingBundledAssets = requiredBundledAssetPrefixes.filter(
  (prefix) => !distAssets.some((fileName) => fileName.startsWith(prefix)),
);

const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
const assetRefs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter((ref) => ref && !ref.startsWith("http") && !ref.startsWith("data:") && !ref.startsWith("#"));

const missingHtmlRefs = assetRefs
  .map((ref) => ref.split("?")[0].split("#")[0])
  .filter((ref) => ref.length > 0)
  .map((ref) => {
    const normalizedRef = ref.startsWith("/") ? ref.slice(1) : ref;
    const baseDir = ref.startsWith("/") ? distDir : dirname(htmlPath);
    return resolve(baseDir, normalizedRef);
  })
  .filter((filePath) => !existsSync(filePath));

if (missingFiles.length || missingHtmlRefs.length || missingBundledAssets.length) {
  console.error("Electron asset verification failed.");

  if (missingFiles.length) {
    console.error("Missing required build files:");
    for (const filePath of missingFiles) {
      console.error(`- ${filePath}`);
    }
  }

  if (missingHtmlRefs.length) {
    console.error("Missing files referenced by dist/index.html:");
    for (const filePath of missingHtmlRefs) {
      console.error(`- ${filePath}`);
    }
  }

  if (missingBundledAssets.length) {
    console.error("Missing bundled renderer assets:");
    for (const assetPrefix of missingBundledAssets) {
      console.error(`- dist/assets/${assetPrefix}*`);
    }
  }

  process.exit(1);
}

console.log("Electron asset verification passed.");
