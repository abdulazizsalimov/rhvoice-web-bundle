import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpmScript(scriptName) {
  const result = spawnSync(npmCommand, ["run", scriptName], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed`);
  }
}

for (const scriptName of [
  "bootstrap:emsdk",
  "sync:rhvoice",
  "prepare:assets",
  "build:native",
  "build:sdk",
  "build:web-bundle",
  "bundle:archive",
]) {
  runNpmScript(scriptName);
}
