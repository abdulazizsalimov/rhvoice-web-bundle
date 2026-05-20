import "./style.css";

import { synthResultToWav } from "./lib/audio";
import { RhvoiceBrowserSdk } from "./lib/sdk";
import type { CatalogVoiceEntry, RhvoiceSnapshot, SynthResult, VoiceInfo } from "./lib/types";

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The RHVoice demo UI is incomplete. Missing ${selector}.`);
  }
  return element;
}

const voiceCatalog = queryRequired<HTMLDivElement>("#voice-catalog");
const speakButton = queryRequired<HTMLButtonElement>("#speak-button");
const voiceSelect = queryRequired<HTMLSelectElement>("#voice-select");
const textInput = queryRequired<HTMLTextAreaElement>("#text-input");
const rateInput = queryRequired<HTMLInputElement>("#rate-input");
const pitchInput = queryRequired<HTMLInputElement>("#pitch-input");
const volumeInput = queryRequired<HTMLInputElement>("#volume-input");
const audioElement = queryRequired<HTMLAudioElement>("#player");
const statusLog = queryRequired<HTMLPreElement>("#status-log");
const packageSummary = queryRequired<HTMLParagraphElement>("#package-summary");
const installedPackages = queryRequired<HTMLDivElement>("#installed-packages");

const sdk = new RhvoiceBrowserSdk({
  workerFactory: () => new Worker(new URL("./worker/rhvoice.worker.ts", import.meta.url), { type: "module" }),
});
sdk.onProgress = (message) => appendLog(message);

let snapshot: RhvoiceSnapshot | null = null;
let isBusy = false;
let lastAudioUrl = "";

sdk.subscribe((nextSnapshot) => {
  snapshot = nextSnapshot;
  renderPackages();
  renderCatalog();
  renderVoices(nextSnapshot.voices);
});

function appendLog(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  statusLog.textContent = `${statusLog.textContent}\n[${timestamp}] ${message}`.trim();
  statusLog.scrollTop = statusLog.scrollHeight;
}

function versionLabel(version: { major: number; minor: number }): string {
  return `${version.major}.${version.minor}`;
}

function renderCatalog(): void {
  if (!snapshot) {
    voiceCatalog.innerHTML = "";
    return;
  }

  voiceCatalog.innerHTML = "";
  for (const entry of sdk.listCatalogVoices()) {
    const article = document.createElement("article");
    article.className = "catalog-item";

    const copy = document.createElement("div");
    copy.className = "catalog-copy";

    const title = document.createElement("div");
    title.className = "catalog-title";
    title.textContent = `${entry.voice.name} for ${entry.language.name}`;

    const meta = document.createElement("div");
    meta.className = "catalog-meta";
    const country = entry.voice.ctry2code ? `, ${entry.voice.ctry2code}` : "";
    const accent = entry.voice.accent ? `, ${entry.voice.accent}` : "";
    meta.textContent =
      `Voice v${versionLabel(entry.voice.version)} | Language v${versionLabel(entry.language.version)}` +
      `${country}${accent}`;

    const status = document.createElement("div");
    status.className = "catalog-status";
    status.textContent = sdk.describeCatalogState(entry);

    copy.append(title, meta, status);

    const actions = document.createElement("div");
    actions.className = "catalog-actions";

    const installAction = sdk.resolveCatalogAction(entry);
    const installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "button button-primary";
    installButton.textContent = installAction;
    installButton.disabled = isBusy;
    installButton.addEventListener("click", () => {
      void installVoice(entry, installAction === "Reinstall");
    });
    actions.append(installButton);

    if (snapshot.installed.packages[entry.voice.id]) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "button button-secondary";
      removeButton.textContent = "Remove Voice";
      removeButton.disabled = isBusy;
      removeButton.addEventListener("click", () => {
        void removePackage(entry.voice.id, `voice ${entry.voice.name}`);
      });
      actions.append(removeButton);
    }

    article.append(copy, actions);
    voiceCatalog.append(article);
  }
}

function renderVoices(voices: VoiceInfo[]): void {
  const previousSelection = voiceSelect.value;
  voiceSelect.innerHTML = "";

  if (voices.length === 0) {
    const option = document.createElement("option");
    option.textContent = "No installed voices";
    option.value = "";
    voiceSelect.append(option);
    voiceSelect.disabled = true;
    speakButton.disabled = true;
    return;
  }

  voiceSelect.disabled = false;
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.language}${voice.country ? `-${voice.country}` : ""})`;
    voiceSelect.append(option);
  }

  const hasPreviousSelection = voices.some((voice) => voice.name === previousSelection);
  voiceSelect.value = hasPreviousSelection ? previousSelection : voices[0].name;
  speakButton.disabled = isBusy || !voiceSelect.value;
}

function renderPackages(): void {
  if (!snapshot) {
    packageSummary.textContent = "Loading registry...";
    installedPackages.innerHTML = "";
    return;
  }

  const packages = Object.values(snapshot.installed.packages).sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name),
  );

  if (packages.length === 0) {
    packageSummary.textContent = `${sdk.listCatalogVoices().length} installable voices are available.`;
    installedPackages.innerHTML = "";
    return;
  }

  packageSummary.textContent = `${packages.length} package(s) installed in persistent storage.`;
  installedPackages.innerHTML = "";
  for (const pkg of packages) {
    const chip = document.createElement("div");
    chip.className = "chip";

    const label = document.createElement("span");
    label.textContent = `${pkg.kind}: ${pkg.name} v${versionLabel(pkg.version)}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-action";
    button.textContent = "Remove";
    button.disabled = isBusy;
    button.addEventListener("click", () => {
      void removePackage(pkg.id, `${pkg.kind} ${pkg.name}`);
    });

    chip.append(label, button);
    installedPackages.append(chip);
  }
}

function setBusy(next: boolean): void {
  isBusy = next;
  if (snapshot) {
    renderCatalog();
    renderPackages();
    renderVoices(snapshot.voices);
  }
}

async function installVoice(entry: CatalogVoiceEntry, force: boolean): Promise<void> {
  const action = force ? "Reinstalling" : `${sdk.resolveCatalogAction(entry)}ing`.replace("Updateing", "Updating");
  setBusy(true);
  appendLog(`${action} ${entry.voice.name}...`);
  try {
    await sdk.installVoice(entry.voice.id, { force });
    appendLog(`${entry.voice.name} is ready.`);
  } catch (error) {
    appendLog(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

async function removePackage(packageId: string, description: string): Promise<void> {
  setBusy(true);
  appendLog(`Removing ${description}...`);
  try {
    await sdk.uninstallPackage(packageId);
    appendLog(`Removed ${description}.`);
  } catch (error) {
    appendLog(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

function playResult(result: SynthResult): void {
  if (lastAudioUrl) {
    URL.revokeObjectURL(lastAudioUrl);
  }
  lastAudioUrl = URL.createObjectURL(synthResultToWav(result));
  audioElement.src = lastAudioUrl;
  audioElement.play().catch(() => undefined);
}

speakButton.addEventListener("click", async () => {
  if (!voiceSelect.value) {
    appendLog("Install a voice first.");
    return;
  }

  setBusy(true);
  appendLog(`Synthesizing with ${voiceSelect.value}...`);
  try {
    const result = await sdk.synthesize({
      text: textInput.value,
      voice: voiceSelect.value,
      rate: Number(rateInput.value),
      pitch: Number(pitchInput.value),
      volume: Number(volumeInput.value),
      messageType: 0,
    });
    playResult(result);
    appendLog(`Synthesis complete. ${result.pcm.length} samples at ${result.sampleRate} Hz.`);
  } catch (error) {
    appendLog(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
});

async function main(): Promise<void> {
  appendLog("Initializing worker...");
  await sdk.init({
    registryUrl: new URL("rhvoice/registry/packages.json", window.location.href).href,
  });
  appendLog("Worker is ready.");
}

void main().catch((error) => {
  appendLog(error instanceof Error ? error.message : String(error));
});
