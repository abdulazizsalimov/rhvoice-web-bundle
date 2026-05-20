import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = resolve(rootDir, ".cache");
const emsdkDir = resolve(cacheDir, "emsdk");
const emsdkVersion = process.env.EMSDK_VERSION ?? "latest";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

mkdirSync(cacheDir, { recursive: true });

if (!existsSync(emsdkDir)) {
  run("git", ["clone", "https://github.com/emscripten-core/emsdk.git", emsdkDir], rootDir);
}

const emccPath = resolve(emsdkDir, "upstream", "emscripten", "emcc");
if (!existsSync(emccPath)) {
  run("./emsdk", ["install", emsdkVersion], emsdkDir);
}

run("./emsdk", ["activate", emsdkVersion], emsdkDir);
