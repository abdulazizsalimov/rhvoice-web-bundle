import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getArgValue, normalizeBasePath, readBundleConfig, rootDir } from "./release-utils.mjs";

const sdkDir = resolve(rootDir, "dist", "sdk");
const embedTemplatePath = resolve(rootDir, "templates", "embed.js");
const variantId = getArgValue("--variant");
const variantLabel = getArgValue("--label") ?? variantId ?? "Default";
const { bundleConfig, configRef } = readBundleConfig(getArgValue("--config"));
const bundleRootDir = variantId
  ? resolve(rootDir, "dist", "web-bundles", variantId)
  : resolve(rootDir, "dist", "web-bundle");

const assetBasePath = normalizeBasePath(bundleConfig.assetBasePath).replace(/^\/+/, "");
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
writeFileSync(resolve(bundleRootDir, "bundle-config.json"), `${JSON.stringify(bundleConfig, null, 2)}\n`);

function formatLanguageSummary(language) {
  const locales = Array.isArray(language.locales) && language.locales.length > 0 ? language.locales.join(", ") : language.code;
  const defaultVoice = language.defaultVoice ?? language.voices[0];
  return `- \`${language.code}\`: voices ${language.voices.map((voice) => `\`${voice}\``).join(", ")}, default \`${defaultVoice}\`, locales ${locales}`;
}

const deploymentPath = `/${assetBasePath}`;
const preloadSummary =
  bundleConfig.runtime?.preloadPolicy === "all-at-init"
    ? "All configured voices are preloaded at init."
    : `Voices are installed on demand. Preloaded voices: ${bundleConfig.runtime?.preloadVoices?.join(", ") || "none"}.`;
const defaultSynthOptionsSummary = Object.keys(bundleConfig.runtime?.defaultSynthOptions ?? {}).length
  ? `Configured default synth options: ${JSON.stringify(bundleConfig.runtime.defaultSynthOptions)}.`
  : "No default synth options are configured in config.json.";

const integrationNote = `# RHVoice Web Bundle: ${variantLabel}

This archive was generated from \`${configRef}\`.

## Included Languages and Voices

${bundleConfig.languages.map((language) => formatLanguageSummary(language)).join("\n")}

## Deploy

1. Copy the \`${assetBasePath}/\` directory from this bundle into your site's static assets.
2. Serve it at \`${deploymentPath}\`.
3. Keep \`${deploymentPath}/config.json\`, \`${deploymentPath}/registry/packages.json\`, and \`${deploymentPath}/packs/*.zip\` together.

## Use in Application Code

\`\`\`js
import { RhvoiceWebTts } from "${deploymentPath}/sdk/index.js";

const tts = new RhvoiceWebTts();
await tts.init();

const result = await tts.synthesize({
  text: "Hello from RHVoice.",
  locale: document.documentElement.lang,
  rate: 0.15,
  pitch: -0.1,
  volume: 0.2
});
\`\`\`

Global defaults from \`${deploymentPath}/config.json\` are applied automatically. You can override them in runtime:

\`\`\`js
tts.setDefaultSynthOptions({
  rate: 0.1,
  pitch: 0,
  volume: 0.15
});
\`\`\`

## Use on Plain HTML Pages

Load \`${deploymentPath}/embed.js\` and use the global helper:

\`\`\`html
<script type="module" src="${deploymentPath}/embed.js"></script>
<script type="module">
  window.RHVoiceWeb.setDefaultSynthOptions({ rate: 0.1, volume: 0.15 });
  await window.RHVoiceWeb.speak({
    text: "Hello from RHVoice.",
    locale: document.documentElement.lang,
    pitch: -0.1
  });
</script>
\`\`\`

The \`rate\`, \`pitch\`, and \`volume\` values are clamped to the RHVoice absolute range \`-1..1\`. Neutral is \`0\`.

## Runtime Behavior

- ${preloadSummary}
- ${defaultSynthOptionsSummary}
- Voices are cached in the browser after the first installation.
- \`window.RHVoiceWeb\` is framework-agnostic and works on plain HTML pages.
- \`RhvoiceWebTts\` from \`sdk/index.js\` works with any frontend stack that can load ES modules.
`;

writeFileSync(resolve(bundleRootDir, "README.md"), integrationNote);
writeFileSync(
  resolve(bundleRootDir, "bundle-manifest.json"),
  `${JSON.stringify(
    {
      variantId: variantId ?? "default",
      variantLabel,
      assetBasePath: `/${assetBasePath}`,
      generatedFromConfig: configRef,
      sdkEntry: `/${assetBasePath}/sdk/index.js`,
      embedEntry: `/${assetBasePath}/embed.js`,
      config: `/${assetBasePath}/config.json`,
      registry: `/${assetBasePath}/registry/packages.json`,
      languages: bundleConfig.languages.map((language) => ({
        code: language.code,
        voices: language.voices,
        defaultVoice: language.defaultVoice ?? language.voices[0],
        locales: language.locales ?? [],
      })),
    },
    null,
    2,
  )}\n`,
);
