import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = resolve(rootDir, "vendor");
const rhvoiceDir = resolve(vendorDir, "RHVoice");
const patchDir = resolve(rootDir, "patches", "rhvoice");

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: options.stdio ?? "inherit",
    encoding: options.encoding ?? "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
  return result;
}

function hasLocalChanges(cwd) {
  const result = run("git", ["status", "--porcelain"], cwd, {
    stdio: "pipe",
  });
  return result.stdout.trim().length > 0;
}

function getPatchFiles() {
  if (!existsSync(patchDir)) {
    return [];
  }

  return readdirSync(patchDir)
    .filter((entry) => entry.endsWith(".patch"))
    .sort()
    .map((entry) => resolve(patchDir, entry));
}

function isPatchApplied(patchPath) {
  const result = spawnSync("git", ["apply", "--reverse", "--check", patchPath], {
    cwd: rhvoiceDir,
    stdio: "ignore",
  });
  return result.status === 0;
}

function canApplyPatch(patchPath) {
  const result = spawnSync("git", ["apply", "--check", patchPath], {
    cwd: rhvoiceDir,
    stdio: "ignore",
  });
  return result.status === 0;
}

function applyManagedPatches() {
  for (const patchPath of getPatchFiles()) {
    if (isPatchApplied(patchPath)) {
      continue;
    }
    if (!canApplyPatch(patchPath)) {
      throw new Error(`Failed to apply RHVoice patch ${patchPath}. The upstream vendor tree no longer matches the expected base.`);
    }
    run("git", ["apply", patchPath], rhvoiceDir);
  }
}

mkdirSync(vendorDir, { recursive: true });

if (!existsSync(rhvoiceDir)) {
  run("git", ["clone", "--depth", "1", "https://github.com/RHVoice/RHVoice.git", rhvoiceDir], rootDir);
} else {
  if (hasLocalChanges(rhvoiceDir)) {
    console.log("vendor/RHVoice has local changes; skipping git pull and preserving the patched vendor tree.");
  } else {
    run("git", ["pull", "--ff-only"], rhvoiceDir);
  }
}

run("git", ["submodule", "update", "--init", "--recursive", "external/libs/boost"], rhvoiceDir);
applyManagedPatches();
