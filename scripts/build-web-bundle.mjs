import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdkDir = resolve(rootDir, "dist", "sdk");
const configPath = resolve(rootDir, "rhvoice.config.json");
const embedTemplatePath = resolve(rootDir, "templates", "embed.js");
const bundleRootDir = resolve(rootDir, "dist", "web-bundle");

if (!existsSync(configPath)) {
  throw new Error("Missing rhvoice.config.json. Create the config before building the bundle.");
}

const bundleConfig = JSON.parse(readFileSync(configPath, "utf8"));
const assetBasePath = (bundleConfig.assetBasePath ?? "/rhvoice").replace(/^\/+/, "").replace(/\/+$/, "");
const rhvoiceAssetsDir = resolve(rootDir, "public", assetBasePath);
const bundleRhvoiceDir = resolve(bundleRootDir, assetBasePath);

if (!existsSync(sdkDir)) {
  throw new Error("SDK build is missing. Run `npm run bundle` or `npm run build:sdk` first.");
}

if (!existsSync(rhvoiceAssetsDir)) {
  throw new Error("Bundle assets are missing. Run `npm run bundle` or `npm run prepare:assets` first.");
}

rmSync(bundleRootDir, { recursive: true, force: true });
mkdirSync(bundleRhvoiceDir, { recursive: true });

cpSync(rhvoiceAssetsDir, bundleRhvoiceDir, { recursive: true });
cpSync(sdkDir, resolve(bundleRhvoiceDir, "sdk"), { recursive: true });
cpSync(embedTemplatePath, resolve(bundleRhvoiceDir, "embed.js"));

const integrationNote = `RHVoice web bundle

1. Copy the "${assetBasePath}" directory from this bundle into your site's static assets.
2. Serve it at "/${assetBasePath}".
3. Import "/${assetBasePath}/sdk/index.js" in application code or "/${assetBasePath}/embed.js" on a plain HTML page.
4. Initialize RhvoiceWebTts or use the global RHVoiceWeb helper from embed.js.

Minimal example:

import { RhvoiceWebTts } from "/${assetBasePath}/sdk/index.js";

const tts = new RhvoiceWebTts();
await tts.init();
const result = await tts.synthesize({
  text: "Hello from RHVoice.",
  locale: document.documentElement.lang
});
`;

writeFileSync(resolve(bundleRootDir, "README.txt"), integrationNote);
writeFileSync(
  resolve(bundleRootDir, "bundle-manifest.json"),
  `${JSON.stringify(
    {
      assetBasePath: `/${assetBasePath}`,
      generatedFromConfig: "rhvoice.config.json",
      sdkEntry: `/${assetBasePath}/sdk/index.js`,
      embedEntry: `/${assetBasePath}/embed.js`,
      config: `/${assetBasePath}/config.json`,
      registry: `/${assetBasePath}/registry/packages.json`,
    },
    null,
    2,
  )}\n`,
);
