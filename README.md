# RHVoice Web Bundle

This repository builds a ready-to-deploy RHVoice WebAssembly bundle for the browser.

It is framework-agnostic:

- plain HTML pages
- server-rendered sites
- React
- Vue
- Angular
- Svelte
- any other stack that can load browser JavaScript modules

It does not depend on a frontend framework. The runtime uses standard browser APIs:

- ES modules
- Web Workers
- WebAssembly
- IndexedDB
- Web Audio

## Main Flow

1. Clone the repository.
2. Edit `rhvoice.config.json`.
3. Run `npm install`.
4. Run `npm run bundle`.
5. Take the generated bundle from `dist/web-bundle/` or `dist/releases/rhvoice-web-bundle.zip`.
6. Copy it into your web app's static assets.
7. Use either:
   - `sdk/index.js` in application code
   - `embed.js` on plain HTML pages without a bundler

## What `npm run bundle` Does

`npm run bundle` performs the full build:

- bootstraps `emsdk` if needed
- clones or updates `RHVoice` if needed
- downloads only the configured language and voice packages
- builds `rhvoice_core.wasm`
- builds the browser SDK
- assembles the final web bundle
- creates `dist/releases/rhvoice-web-bundle.zip`

The repository does not store built wasm artifacts, `dist/`, `vendor/RHVoice/`, or the downloaded toolchain in git. They are generated locally by the build scripts.

## Configure Voices

Edit `rhvoice.config.json`:

```json
{
  "assetBasePath": "/rhvoice",
  "languages": [
    {
      "code": "uz",
      "voices": ["sevinch"],
      "defaultVoice": "sevinch",
      "locales": ["uz-UZ"]
    },
    {
      "code": "ru",
      "voices": ["anna"],
      "defaultVoice": "anna",
      "locales": ["ru-RU"]
    },
    {
      "code": "en",
      "voices": ["alan"],
      "defaultVoice": "alan",
      "locales": ["en-US", "en-GB"]
    }
  ],
  "runtime": {
    "preloadPolicy": "on-demand",
    "preloadVoices": ["sevinch"]
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

## Build Output

After `npm run bundle` you get:

- `dist/web-bundle/README.txt`
- `dist/web-bundle/bundle-manifest.json`
- `dist/web-bundle/rhvoice/config.json`
- `dist/web-bundle/rhvoice/registry/packages.json`
- `dist/web-bundle/rhvoice/packs/*.zip`
- `dist/web-bundle/rhvoice/sdk/index.js`
- `dist/web-bundle/rhvoice/sdk/worker/rhvoice.worker.js`
- `dist/web-bundle/rhvoice/embed.js`
- `dist/releases/rhvoice-web-bundle.zip`

## Deploy

Copy the generated `rhvoice/` directory into your static assets so that `assetBasePath` matches the final URL.

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
  window.addEventListener("rhvoice:ready", async () => {
    await window.RHVoiceWeb.speak({
      text: "Hello from RHVoice.",
      locale: document.documentElement.lang
    });
  });

  window.addEventListener("rhvoice:error", (event) => {
    console.error("RHVoice failed to initialize", event.detail);
  });
</script>
<script type="module" src="/rhvoice/embed.js"></script>
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

Minimal plain HTML usage:

```html
<!doctype html>
<html lang="en">
  <body>
    <button id="speak">Speak</button>

    <script>
      window.addEventListener("rhvoice:error", (event) => {
        console.error(event.detail);
      });
    </script>
    <script type="module" src="/rhvoice/embed.js"></script>
    <script type="module">
      document.getElementById("speak").addEventListener("click", async () => {
        await window.RHVoiceWeb.speak({
          text: "This page is using RHVoice without a bundler.",
          locale: document.documentElement.lang
        });
      });
    </script>
  </body>
</html>
```

## Is It Universal?

Yes, for modern web stacks.

It is not tied to any framework. The bundle is just browser JavaScript plus wasm assets.

That means:

- plain HTML pages can use `embed.js`
- application code can use `sdk/index.js`
- any framework can wrap the runtime however it wants

The only real requirement is a modern browser with ES modules, Web Workers, WebAssembly, and IndexedDB support.

## Useful Commands

Main command:

```bash
npm run bundle
```

Other commands:

```bash
npm run smoke
npm run build:sdk
npm run build:web-bundle
npm run bundle:archive
npm run test:e2e
```

`npm run smoke` writes a WAV file in `artifacts/` using the first configured voice.
