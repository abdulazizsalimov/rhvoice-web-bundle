import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getArgValue, readReleaseVariants, rootDir } from "./release-utils.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const selectedVariantId = getArgValue("--variant");

function runNpmScript(scriptName) {
  const result = spawnSync(npmCommand, ["run", scriptName], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed`);
  }
}

function runNodeScript(relativePath, args = []) {
  const result = spawnSync(process.execPath, [resolve(rootDir, relativePath), ...args], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`node ${relativePath} ${args.join(" ")} failed`);
  }
}

for (const scriptName of ["bootstrap:emsdk", "sync:rhvoice", "build:native", "build:sdk"]) {
  runNpmScript(scriptName);
}

const variants = readReleaseVariants(selectedVariantId);

if (variants.length === 0) {
  for (const scriptName of ["prepare:assets", "build:web-bundle", "bundle:archive"]) {
    runNpmScript(scriptName);
  }
} else {
  const bundleOutputRoot = resolve(rootDir, "dist", "web-bundles");
  const releaseOutputRoot = resolve(rootDir, "dist", "releases");

  rmSync(bundleOutputRoot, { recursive: true, force: true });
  rmSync(releaseOutputRoot, { recursive: true, force: true });
  mkdirSync(bundleOutputRoot, { recursive: true });
  mkdirSync(releaseOutputRoot, { recursive: true });

  for (const variant of variants) {
    runNodeScript("scripts/prepare-bundle-assets.mjs", ["--config", variant.config]);
    runNodeScript("scripts/build-web-bundle.mjs", [
      "--config",
      variant.config,
      "--variant",
      variant.id,
      "--label",
      variant.label,
    ]);
    runNodeScript("scripts/archive-web-bundle.mjs", ["--variant", variant.id]);
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    variants: variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      description: variant.description,
      config: variant.config,
      bundleDir: `dist/web-bundles/${variant.id}`,
      archive: `dist/releases/rhvoice-web-bundle-${variant.id}.zip`,
    })),
  };

  writeFileSync(resolve(releaseOutputRoot, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    resolve(bundleOutputRoot, "README.md"),
    `# RHVoice Web Release Bundles

Run \`npm run bundle\` to rebuild every configured release variant.

Generated variants:

${variants.map((variant) => `- \`${variant.id}\`: ${variant.label} -> \`dist/releases/rhvoice-web-bundle-${variant.id}.zip\``).join("\n")}
`,
  );
}
