import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdkDir = resolve(rootDir, "dist", "sdk");
const configPath = resolve(rootDir, "rhvoice.site.config.json");
const bundleRootDir = resolve(rootDir, "dist", "site-bundle");

if (!existsSync(configPath)) {
  throw new Error("Missing rhvoice.site.config.json. Create the site config before building the bundle.");
}

const siteConfig = JSON.parse(readFileSync(configPath, "utf8"));
const assetBasePath = (siteConfig.assetBasePath ?? "/rhvoice").replace(/^\/+/, "").replace(/\/+$/, "");
const rhvoiceAssetsDir = resolve(rootDir, "public", assetBasePath);
const bundleRhvoiceDir = resolve(bundleRootDir, assetBasePath);

if (!existsSync(sdkDir)) {
  throw new Error("SDK build is missing. Run `npm run bundle` or `npm run build:sdk` first.");
}

if (!existsSync(rhvoiceAssetsDir)) {
  throw new Error("Site assets are missing. Run `npm run bundle` or `npm run prepare:site` first.");
}

rmSync(bundleRootDir, { recursive: true, force: true });
mkdirSync(bundleRhvoiceDir, { recursive: true });

cpSync(rhvoiceAssetsDir, bundleRhvoiceDir, { recursive: true });
cpSync(sdkDir, resolve(bundleRhvoiceDir, "sdk"), { recursive: true });

const integrationNote = `RHVoice site bundle

1. Copy the "${assetBasePath}" directory from this bundle into your site's static assets.
2. Serve it at "/${assetBasePath}".
3. Import "/${assetBasePath}/sdk/index.js" in the main site.
4. Initialize RhvoiceSiteTts and call synthesize().

Minimal example:

import { RhvoiceSiteTts } from "/${assetBasePath}/sdk/index.js";

const tts = new RhvoiceSiteTts();
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
      generatedFromConfig: "rhvoice.site.config.json",
      sdkEntry: `/${assetBasePath}/sdk/index.js`,
      siteConfig: `/${assetBasePath}/site-config.json`,
      registry: `/${assetBasePath}/registry/packages.json`,
    },
    null,
    2,
  )}\n`,
);
