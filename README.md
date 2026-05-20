# RHVoice Web Bundle

This repository builds ready-to-deploy RHVoice WebAssembly bundles for the browser.

It is framework-agnostic:

- plain HTML pages
- server-rendered sites
- React
- Vue
- Angular
- Svelte
- any other stack that can load browser JavaScript modules

The runtime uses standard browser APIs only:

- ES modules
- Web Workers
- WebAssembly
- IndexedDB
- Web Audio

## Main Flow

1. Clone the repository.
2. Edit the release preset files in `configs/`.
3. Edit `rhvoice.variants.json` to choose which bundles should be published.
4. Run `npm install`.
5. Run `npm run bundle`.
6. Take the generated bundles from `dist/web-bundles/` or the zip archives from `dist/releases/`.
7. Copy the selected `rhvoice/` directory into your web app's static assets.
8. Use either:
   - `sdk/index.js` in application code
   - `embed.js` on plain HTML pages without a bundler

Each generated bundle includes its own `README.md` with deployment and usage instructions.

## Release Variants

`npm run bundle` builds every preset listed in `rhvoice.variants.json`.

Current examples:

- `en`: English-only bundle with multiple English voices
- `en_ru`: English and Russian bundle

Example `rhvoice.variants.json`:

```json
{
  "version": 1,
  "variants": [
    {
      "id": "en",
      "label": "English Voices",
      "config": "configs/en.json"
    },
    {
      "id": "en_ru",
      "label": "English and Russian Voices",
      "config": "configs/en_ru.json"
    }
  ]
}
```

If you need just one archive:

```bash
npm run bundle -- --variant en
```

## Configure a Variant

Each bundle preset is just a JSON file in `configs/`.

Example `configs/en_ru.json`:

```json
{
  "assetBasePath": "/rhvoice",
  "languages": [
    {
      "code": "en",
      "voices": ["alan", "slt"],
      "defaultVoice": "alan",
      "locales": ["en-US", "en-GB"]
    },
    {
      "code": "ru",
      "voices": ["anna", "pavel"],
      "defaultVoice": "anna",
      "locales": ["ru-RU"]
    }
  ],
  "runtime": {
    "preloadPolicy": "on-demand",
    "preloadVoices": ["alan"]
  }
}
```

Key fields:

- `assetBasePath`: where the bundle will be served, for example `/rhvoice`
- `languages[].code`: official RHVoice language code
- `languages[].voices`: voice allowlist for that language
- `languages[].defaultVoice`: default voice for locale mapping
- `languages[].locales`: locale aliases that should resolve to that default voice
- `runtime.preloadPolicy`: `on-demand` or `all-at-init`
- `runtime.preloadVoices`: voices to preinstall immediately after init

`rhvoice.config.json` remains the default local config for `npm run dev`, `npm run smoke`, and `npm run test:e2e`.

## What `npm run bundle` Does

`npm run bundle` performs the full release build:

- bootstraps `emsdk` if needed
- clones or updates `RHVoice` if needed
- builds `rhvoice_core.wasm`
- builds the browser SDK
- downloads only the configured language and voice packages for each variant
- assembles a separate web bundle for each configured variant
- creates a zip archive for each variant

The repository does not store built wasm artifacts, `dist/`, `vendor/RHVoice/`, or the downloaded toolchain in git. They are generated locally by the build scripts.

## Build Output

After `npm run bundle` you get:

- `dist/web-bundles/README.md`
- `dist/web-bundles/en/README.md`
- `dist/web-bundles/en/bundle-manifest.json`
- `dist/web-bundles/en/rhvoice/config.json`
- `dist/web-bundles/en/rhvoice/registry/packages.json`
- `dist/web-bundles/en/rhvoice/packs/*.zip`
- `dist/web-bundles/en/rhvoice/sdk/index.js`
- `dist/web-bundles/en/rhvoice/sdk/worker/rhvoice.worker.js`
- `dist/web-bundles/en/rhvoice/embed.js`
- `dist/web-bundles/en_ru/README.md`
- `dist/web-bundles/en_ru/rhvoice/...`
- `dist/releases/rhvoice-web-bundle-en.zip`
- `dist/releases/rhvoice-web-bundle-en_ru.zip`
- `dist/releases/release-manifest.json`

Each bundle directory and each zip archive is self-contained.

## Deploy

Choose one release bundle and copy its `rhvoice/` directory into your static assets so that `assetBasePath` matches the final URL.

If `assetBasePath` is `/rhvoice`, then these URLs should exist:

- `/rhvoice/config.json`
- `/rhvoice/registry/packages.json`
- `/rhvoice/sdk/index.js`
- `/rhvoice/sdk/worker/rhvoice.worker.js`
- `/rhvoice/embed.js`

## Use in App Code

For application code, import the high-level runtime:

```ts
import { RhvoiceWebTts } from "/rhvoice/sdk/index.js";

const tts = new RhvoiceWebTts();
await tts.init();

const result = await tts.synthesize({
  text: "Hello from RHVoice.",
  locale: document.documentElement.lang
});
```

You can also force a configured voice:

```ts
const result = await tts.synthesize({
  text: "Hello from RHVoice.",
  voiceId: "alan"
});
```

What the runtime does:

- loads `/rhvoice/config.json`
- loads the generated registry
- resolves a configured voice from `locale`
- installs that voice automatically if it is not cached yet
- synthesizes speech with RHVoice

## Use on Plain HTML Pages

If you do not have a bundler, use `embed.js`.

Add this to the page:

```html
<script>
  window.addEventListener("rhvoice:error", (event) => {
    console.error("RHVoice failed to initialize", event.detail);
  });
</script>
<script type="module" src="/rhvoice/embed.js"></script>
<script type="module">
  await window.RHVoiceWeb.speak({
    text: "This page is using RHVoice without a bundler.",
    locale: document.documentElement.lang
  });
</script>
```

`embed.js` exposes `window.RHVoiceWeb` with:

- `ready`
- `init()`
- `synthesize()`
- `createAudio()`
- `speak()`
- `ensureLocale()`
- `getConfig()`
- `getSnapshot()`
- `dispose()`

## Is It Universal?

Yes, for modern web stacks.

It is not tied to any framework. The bundle is just browser JavaScript plus wasm assets.

That means:

- plain HTML pages can use `embed.js`
- application code can use `sdk/index.js`
- any framework can wrap the runtime however it wants

The only real requirement is a modern browser with ES modules, Web Workers, WebAssembly, and IndexedDB support.

## Useful Commands

Main release command:

```bash
npm run bundle
```

Build one variant only:

```bash
npm run bundle -- --variant en
```

Other commands:

```bash
npm run smoke
npm run build:sdk
npm run test:e2e
```

`npm run smoke` writes a WAV file in `artifacts/` using the first configured voice from `rhvoice.config.json`.
