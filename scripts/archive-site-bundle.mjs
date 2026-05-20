import { zipSync } from "fflate";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(rootDir, "dist", "site-bundle");
const releaseDir = resolve(rootDir, "dist", "releases");
const outputPath = resolve(releaseDir, "rhvoice-site-bundle.zip");

if (!existsSync(sourceDir)) {
  throw new Error("Site bundle directory is missing. Run `npm run bundle` or `npm run build:site-bundle` first.");
}

function collectFiles(baseDir, currentDir = baseDir, result = {}) {
  for (const entry of readdirSync(currentDir)) {
    const fullPath = resolve(currentDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(baseDir, fullPath, result);
      continue;
    }
    const archivePath = relative(baseDir, fullPath).replace(/\\/g, "/");
    result[archivePath] = readFileSync(fullPath);
  }
  return result;
}

const files = collectFiles(sourceDir);
mkdirSync(releaseDir, { recursive: true });
rmSync(outputPath, { force: true });
writeFileSync(outputPath, Buffer.from(zipSync(files, { level: 9 })));

console.log(`Wrote ${relative(rootDir, outputPath)} with ${Object.keys(files).length} file(s).`);
