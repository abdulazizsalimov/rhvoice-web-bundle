# RHVoice Web Bundle Builder

This repository builds a ready-to-deploy RHVoice WebAssembly bundle for websites.

The target workflow is simple:

1. Clone the repository.
2. Edit `rhvoice.site.config.json`.
3. Run `npm install`.
4. Run `npm run bundle`.
5. Take the generated bundle from `dist/site-bundle/` or `dist/releases/rhvoice-site-bundle.zip`.
6. Copy it into your site's static assets and import the SDK.

The bundle is administrator-managed:

- you decide which languages exist
- you decide which voices exist
- users do not see an install UI
- only configured voices can be downloaded by the browser runtime

## Quick Start

Edit `rhvoice.site.config.json`:

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

Then run:

```bash
npm install
npm run bundle
```

That one command will:

- bootstrap `emsdk` if needed
- clone or update `RHVoice`
- fetch only the configured language and voice packages
- build `rhvoice_core.wasm`
- build the browser SDK
- assemble a ready-to-deploy bundle
- create `dist/releases/rhvoice-site-bundle.zip`

## Output Artifacts

After `npm run bundle` you get:

- `dist/site-bundle/`
- `dist/site-bundle/README.txt`
- `dist/site-bundle/bundle-manifest.json`
- `dist/site-bundle/rhvoice/`
- `dist/releases/rhvoice-site-bundle.zip`

Inside `dist/site-bundle/rhvoice/`:

- `site-config.json`
- `registry/packages.json`
- `packs/*.zip`
- `sdk/index.js`
- `sdk/worker/rhvoice.worker.js`
- `sdk/worker/assets/rhvoice_core-*.wasm`

## Site Config

`rhvoice.site.config.json` controls what goes into the final bundle.

Fields:

- `assetBasePath`: where the bundle will live on the target site, for example `/rhvoice`
- `languages[].code`: RHVoice language code, for example `uz`, `ru`, `en`
- `languages[].voices`: allowed voice ids for that language
- `languages[].defaultVoice`: default voice for locale mapping
- `languages[].locales`: locale aliases that should resolve to that default voice
- `runtime.preloadPolicy`: `on-demand` or `all-at-init`
- `runtime.preloadVoices`: voices to install immediately after `init()`

Behavior:

- `on-demand`: voices are downloaded only when first used
- `all-at-init`: all configured default voices are installed during startup

## Deploy

Copy the bundle directory into your site's static assets so that `assetBasePath` is respected.

If `assetBasePath` is `/rhvoice`, then these URLs should exist on the site:

- `/rhvoice/site-config.json`
- `/rhvoice/registry/packages.json`
- `/rhvoice/sdk/index.js`
- `/rhvoice/sdk/worker/rhvoice.worker.js`

## Integrate

Use the high-level runtime:

```ts
import { RhvoiceSiteTts } from "/rhvoice/sdk/index.js";

const tts = new RhvoiceSiteTts();

await tts.init();

const result = await tts.synthesize({
  text: "Hello from RHVoice.",
  locale: document.documentElement.lang
});
```

You can also force a voice id:

```ts
const result = await tts.synthesize({
  text: "Hello from RHVoice.",
  voiceId: "alan"
});
```

The runtime will:

- load `site-config.json`
- load the generated registry
- resolve a configured voice from `locale`
- install that voice automatically if it is not cached yet
- synthesize speech with RHVoice

## Useful Commands

Main command:

```bash
npm run bundle
```

Other commands:

```bash
npm run smoke
npm run build:sdk
npm run build:site-bundle
npm run bundle:archive
npm run test:e2e
```

`npm run smoke` writes a WAV file in `artifacts/` using the first configured voice.

## Notes

- `RHVoice` sources are fetched automatically by `npm run bundle`.
- `emsdk` is fetched automatically by `npm run bundle`.
- The repository still contains a demo page and Playwright coverage for development, but the production path is the generated site bundle plus `RhvoiceSiteTts`.
