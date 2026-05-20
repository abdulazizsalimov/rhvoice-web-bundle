import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = resolve(rootDir, "vendor");
const rhvoiceDir = resolve(vendorDir, "RHVoice");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

mkdirSync(vendorDir, { recursive: true });

if (!existsSync(rhvoiceDir)) {
  run("git", ["clone", "--depth", "1", "https://github.com/RHVoice/RHVoice.git", rhvoiceDir], rootDir);
} else {
  run("git", ["pull", "--ff-only"], rhvoiceDir);
}

run("git", ["submodule", "update", "--init", "--recursive", "external/libs/boost"], rhvoiceDir);
