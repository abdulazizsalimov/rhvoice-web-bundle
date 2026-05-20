import { loadWebConfig, defaultWebConfigUrl } from "./web-config";
import { RhvoiceBrowserSdk } from "./sdk";
import type { RhvoiceBrowserSdkOptions } from "./sdk";
import type {
  CatalogVoiceEntry,
  RhvoiceDefaultSynthOptions,
  RhvoiceSnapshot,
  RhvoiceWebConfig,
  RhvoiceWebSynthRequest,
  SynthResult,
  VoicePackage,
} from "./types";

export interface RhvoiceWebTtsOptions extends RhvoiceBrowserSdkOptions {
  config?: RhvoiceWebConfig;
  configUrl?: string;
}

function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clampSynthValue(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function normalizeSynthOptions(options: RhvoiceDefaultSynthOptions | undefined): RhvoiceDefaultSynthOptions {
  if (!options) {
    return {};
  }

  const normalized: RhvoiceDefaultSynthOptions = {};
  for (const key of ["rate", "pitch", "volume"] as const) {
    const value = options[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      normalized[key] = clampSynthValue(value);
    }
  }
  return normalized;
}

export class RhvoiceWebTts {
  private readonly sdk: RhvoiceBrowserSdk;
  private config: RhvoiceWebConfig | null = null;
  private readonly configUrl?: string;
  private readonly inlineConfig?: RhvoiceWebConfig;
  private configDefaultSynthOptions: RhvoiceDefaultSynthOptions = {};
  private runtimeDefaultSynthOptions: RhvoiceDefaultSynthOptions = {};

  constructor(options: RhvoiceWebTtsOptions = {}) {
    this.configUrl = options.configUrl;
    this.inlineConfig = options.config;
    this.sdk = new RhvoiceBrowserSdk(options);
  }

  async init(): Promise<RhvoiceSnapshot> {
    this.config = this.inlineConfig ?? (await loadWebConfig(this.configUrl ?? defaultWebConfigUrl()));
    this.configDefaultSynthOptions = normalizeSynthOptions(this.config.defaultSynthOptions);
    const snapshot = await this.sdk.init({ registryUrl: this.config.registryUrl });
    await this.preloadConfiguredVoices();
    return this.requireSnapshot(snapshot);
  }

  getConfig(): RhvoiceWebConfig | null {
    return this.config;
  }

  getSnapshot(): RhvoiceSnapshot | null {
    return this.sdk.getSnapshot();
  }

  getDefaultSynthOptions(): RhvoiceDefaultSynthOptions {
    return { ...this.resolveDefaultSynthOptions() };
  }

  getVoiceOptions(): RhvoiceDefaultSynthOptions {
    return this.getDefaultSynthOptions();
  }

  setDefaultSynthOptions(options: RhvoiceDefaultSynthOptions = {}): RhvoiceDefaultSynthOptions {
    this.runtimeDefaultSynthOptions = {
      ...this.runtimeDefaultSynthOptions,
      ...normalizeSynthOptions(options),
    };
    return this.getDefaultSynthOptions();
  }

  setVoiceOptions(options: RhvoiceDefaultSynthOptions = {}): RhvoiceDefaultSynthOptions {
    return this.setDefaultSynthOptions(options);
  }

  resetDefaultSynthOptions(): RhvoiceDefaultSynthOptions {
    this.runtimeDefaultSynthOptions = {};
    return this.getDefaultSynthOptions();
  }

  async installConfiguredVoices(): Promise<RhvoiceSnapshot> {
    this.requireConfig();
    for (const voiceId of this.configuredVoiceIds()) {
      await this.ensureVoiceInstalled(voiceId);
    }
    return this.requireSnapshot();
  }

  async ensureLocale(locale: string): Promise<VoicePackage> {
    const voice = this.resolveVoicePackageForLocale(locale);
    await this.ensureVoiceInstalled(voice.id);
    return voice;
  }

  async synthesize(request: RhvoiceWebSynthRequest): Promise<SynthResult> {
    const voice = request.voiceId
      ? this.findVoicePackageById(request.voiceId)
      : this.resolveVoicePackageForLocale(request.locale ?? "");
    const synthOptions = this.resolveSynthOptions(request);

    await this.ensureVoiceInstalled(voice.id);

    return this.sdk.synthesize({
      text: request.text,
      voice: voice.name,
      rate: synthOptions.rate,
      pitch: synthOptions.pitch,
      volume: synthOptions.volume,
      messageType: request.messageType,
    });
  }

  dispose(): void {
    this.sdk.dispose();
  }

  private async preloadConfiguredVoices(): Promise<void> {
    const config = this.requireConfig();
    const preloadVoiceIds =
      config.preloadPolicy === "all-at-init" ? this.configuredVoiceIds() : unique(config.preloadVoices);

    for (const voiceId of preloadVoiceIds) {
      await this.ensureVoiceInstalled(voiceId);
    }
  }

  private configuredVoiceIds(): string[] {
    const config = this.requireConfig();
    const localeVoiceIds = Object.values(config.defaultVoiceByLocale);
    return unique([...localeVoiceIds, ...config.preloadVoices, config.fallbackVoice]);
  }

  private resolveDefaultSynthOptions(): RhvoiceDefaultSynthOptions {
    return {
      ...this.configDefaultSynthOptions,
      ...this.runtimeDefaultSynthOptions,
    };
  }

  private resolveSynthOptions(request: RhvoiceWebSynthRequest): RhvoiceDefaultSynthOptions {
    return {
      ...this.resolveDefaultSynthOptions(),
      ...normalizeSynthOptions(request),
    };
  }

  private async ensureVoiceInstalled(voiceId: string): Promise<void> {
    const snapshot = this.requireSnapshot();
    if (snapshot.installed.packages[voiceId]) {
      return;
    }
    await this.sdk.installVoice(voiceId);
  }

  private resolveVoicePackageForLocale(locale: string): VoicePackage {
    const config = this.requireConfig();
    const normalized = normalizeLocale(locale);
    const primary = normalized.split("-")[0];
    const voiceId =
      config.defaultVoiceByLocale[normalized] ??
      config.defaultVoiceByLocale[primary] ??
      config.fallbackVoice;
    return this.findVoicePackageById(voiceId);
  }

  private findVoicePackageById(voiceId: string): VoicePackage {
    for (const entry of this.catalogEntries()) {
      if (entry.voice.id === voiceId) {
        return entry.voice;
      }
    }
    throw new Error(`Configured RHVoice voice is missing from the registry: ${voiceId}`);
  }

  private catalogEntries(): CatalogVoiceEntry[] {
    const snapshot = this.requireSnapshot();
    return snapshot.registry.languages.flatMap((language) => language.voices.map((voice) => ({ language, voice })));
  }

  private requireConfig(): RhvoiceWebConfig {
    if (!this.config) {
      throw new Error("RHVoice web runtime is not initialized. Call init() first.");
    }
    return this.config;
  }

  private requireSnapshot(snapshot = this.sdk.getSnapshot()): RhvoiceSnapshot {
    if (!snapshot) {
      throw new Error("RHVoice browser SDK is not initialized. Call init() first.");
    }
    return snapshot;
  }
}
