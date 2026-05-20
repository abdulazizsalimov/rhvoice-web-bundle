import { RhvoiceBrowserSdk } from "./sdk";
import { defaultSiteConfigUrl, loadSiteConfig } from "./site-config";
import type { RhvoiceBrowserSdkOptions } from "./sdk";
import type {
  CatalogVoiceEntry,
  RhvoiceSiteConfig,
  RhvoiceSnapshot,
  SiteSynthRequest,
  SynthResult,
  VoicePackage,
} from "./types";

export interface RhvoiceSiteTtsOptions extends RhvoiceBrowserSdkOptions {
  config?: RhvoiceSiteConfig;
  configUrl?: string;
}

function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export class RhvoiceSiteTts {
  private readonly sdk: RhvoiceBrowserSdk;
  private config: RhvoiceSiteConfig | null = null;
  private readonly configUrl?: string;
  private readonly inlineConfig?: RhvoiceSiteConfig;

  constructor(options: RhvoiceSiteTtsOptions = {}) {
    this.configUrl = options.configUrl;
    this.inlineConfig = options.config;
    this.sdk = new RhvoiceBrowserSdk(options);
  }

  async init(): Promise<RhvoiceSnapshot> {
    this.config = this.inlineConfig ?? (await loadSiteConfig(this.configUrl ?? defaultSiteConfigUrl()));
    const snapshot = await this.sdk.init({ registryUrl: this.config.registryUrl });
    await this.preloadConfiguredVoices();
    return this.requireSnapshot(snapshot);
  }

  getConfig(): RhvoiceSiteConfig | null {
    return this.config;
  }

  getSnapshot(): RhvoiceSnapshot | null {
    return this.sdk.getSnapshot();
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

  async synthesize(request: SiteSynthRequest): Promise<SynthResult> {
    const voice = request.voiceId
      ? this.findVoicePackageById(request.voiceId)
      : this.resolveVoicePackageForLocale(request.locale ?? "");

    await this.ensureVoiceInstalled(voice.id);

    return this.sdk.synthesize({
      text: request.text,
      voice: voice.name,
      rate: request.rate,
      pitch: request.pitch,
      volume: request.volume,
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

  private requireConfig(): RhvoiceSiteConfig {
    if (!this.config) {
      throw new Error("RHVoice site runtime is not initialized. Call init() first.");
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
