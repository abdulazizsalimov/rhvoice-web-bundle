import { RhvoiceWorkerClient } from "./client";
import type {
  CatalogVoiceEntry,
  InitOptions,
  InitPayload,
  InstallVoiceOptions,
  PackageInstallAction,
  RhvoiceSnapshot,
  SynthRequest,
  SynthResult,
} from "./types";

export type RhvoiceSnapshotListener = (snapshot: RhvoiceSnapshot) => void;

export interface RhvoiceBrowserSdkOptions {
  onProgress?: (message: string) => void;
  registryUrl?: string;
  worker?: Worker;
  workerFactory?: () => Worker;
}

function installPath(kind: "language" | "voice", id: string, version: { major: number; minor: number }): string {
  return `/rhvoice/packs/${kind}/${id}@${version.major}.${version.minor}`;
}

export function resolveDefaultRhvoiceWorkerUrl(): URL {
  const relativePath = "./worker/rhvoice.worker.js";
  return new URL(relativePath, import.meta.url);
}

export function createDefaultRhvoiceWorker(): Worker {
  return new Worker(resolveDefaultRhvoiceWorkerUrl(), { type: "module" });
}

export class RhvoiceBrowserSdk {
  private readonly client: RhvoiceWorkerClient;
  private readonly worker: Worker;
  private readonly ownsWorker: boolean;
  private readonly listeners = new Set<RhvoiceSnapshotListener>();
  private readonly registryUrl?: string;
  private snapshot: RhvoiceSnapshot | null = null;

  onProgress?: (message: string) => void;

  constructor(options: RhvoiceBrowserSdkOptions = {}) {
    this.worker = options.worker ?? options.workerFactory?.() ?? createDefaultRhvoiceWorker();
    this.ownsWorker = !options.worker;
    this.onProgress = options.onProgress;
    this.registryUrl = options.registryUrl;
    this.client = new RhvoiceWorkerClient(this.worker);
    this.client.onProgress = (message) => {
      this.onProgress?.(message);
    };
  }

  async init(options: InitOptions = {}): Promise<RhvoiceSnapshot> {
    return this.applySnapshot(
      await this.client.init({
        registryUrl: options.registryUrl ?? this.registryUrl,
      }),
    );
  }

  getSnapshot(): RhvoiceSnapshot | null {
    return this.snapshot;
  }

  subscribe(listener: RhvoiceSnapshotListener): () => void {
    this.listeners.add(listener);
    if (this.snapshot) {
      listener(this.snapshot);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  listCatalogVoices(): CatalogVoiceEntry[] {
    const snapshot = this.requireSnapshot();
    return snapshot.registry.languages
      .flatMap((language) => language.voices.map((voice) => ({ language, voice })))
      .sort(
        (left, right) =>
          left.language.name.localeCompare(right.language.name) || left.voice.name.localeCompare(right.voice.name),
      );
  }

  resolveCatalogAction(entry: CatalogVoiceEntry): PackageInstallAction {
    const snapshot = this.requireSnapshot();
    const installedLanguage = snapshot.installed.packages[entry.language.id];
    const installedVoice = snapshot.installed.packages[entry.voice.id];
    const expectedLanguagePath = installPath("language", entry.language.id, entry.language.version);
    const expectedVoicePath = installPath("voice", entry.voice.id, entry.voice.version);

    if (!installedLanguage || !installedVoice) {
      return "Install";
    }

    if (installedLanguage.path !== expectedLanguagePath || installedVoice.path !== expectedVoicePath) {
      return "Update";
    }

    return "Reinstall";
  }

  describeCatalogState(entry: CatalogVoiceEntry): string {
    const snapshot = this.requireSnapshot();
    const installedLanguage = snapshot.installed.packages[entry.language.id];
    const installedVoice = snapshot.installed.packages[entry.voice.id];
    const expectedLanguagePath = installPath("language", entry.language.id, entry.language.version);
    const expectedVoicePath = installPath("voice", entry.voice.id, entry.voice.version);

    if (!installedVoice && !installedLanguage) {
      return `Requires ${entry.language.name} language pack.`;
    }
    if (!installedVoice && installedLanguage) {
      return `${entry.language.name} is installed. Voice pack is missing.`;
    }
    if (!installedLanguage && installedVoice) {
      return "Voice pack is present, but the required language pack is missing.";
    }
    if (installedLanguage.path !== expectedLanguagePath || installedVoice.path !== expectedVoicePath) {
      return "An older package revision is installed.";
    }
    return "Installed in persistent storage.";
  }

  async installVoice(voiceId: string, options: InstallVoiceOptions = {}): Promise<RhvoiceSnapshot> {
    return this.applySnapshot(await this.client.installVoice(voiceId, options));
  }

  async uninstallPackage(packageId: string): Promise<RhvoiceSnapshot> {
    return this.applySnapshot(await this.client.uninstallPackage(packageId));
  }

  async synthesize(payload: SynthRequest): Promise<SynthResult> {
    return this.client.synthesize(payload);
  }

  dispose(): void {
    this.listeners.clear();
    if (this.ownsWorker) {
      this.worker.terminate();
    }
  }

  private applySnapshot(payload: InitPayload | { installed: RhvoiceSnapshot["installed"]; voices: RhvoiceSnapshot["voices"] }): RhvoiceSnapshot {
    const registry = "registry" in payload ? payload.registry : this.requireSnapshot().registry;
    this.snapshot = {
      registry,
      installed: payload.installed,
      voices: payload.voices,
    };
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
    return this.snapshot;
  }

  private requireSnapshot(): RhvoiceSnapshot {
    if (!this.snapshot) {
      throw new Error("RHVoice SDK is not initialized. Call init() first.");
    }
    return this.snapshot;
  }
}
