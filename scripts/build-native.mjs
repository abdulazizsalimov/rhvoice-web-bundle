import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const emsdkDir = resolve(rootDir, ".cache", "emsdk");
const rhvoiceDir = resolve(rootDir, "vendor", "RHVoice");
const nativeDir = resolve(rootDir, "native");
const buildDir = resolve(nativeDir, "build");
const outputDir = resolve(rootDir, "src", "generated", "native");

if (!existsSync(resolve(emsdkDir, "emsdk_env.sh"))) {
  throw new Error("emsdk is not bootstrapped. Run `npm run bootstrap:emsdk` first.");
}

if (!existsSync(rhvoiceDir)) {
  throw new Error("RHVoice sources are missing. Run `npm run sync:rhvoice` first.");
}

mkdirSync(outputDir, { recursive: true });

const jobs = Math.max(availableParallelism() - 1, 1);
const shellCommand = [
  `source "${resolve(emsdkDir, "emsdk_env.sh")}" >/dev/null`,
  `emcmake cmake -S "${nativeDir}" -B "${buildDir}" -DCMAKE_BUILD_TYPE=Release -DRHVOICE_SRC="${rhvoiceDir}" -DNATIVE_OUT_DIR="${outputDir}"`,
  `cmake --build "${buildDir}" --parallel ${jobs}`,
].join(" && ");

const result = spawnSync("bash", ["-lc", shellCommand], {
  cwd: rootDir,
  stdio: "inherit",
});

if (result.status !== 0) {
  throw new Error("Native wasm build failed.");
}
