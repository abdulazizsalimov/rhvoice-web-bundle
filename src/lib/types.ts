export interface PackageVersion {
  major: number;
  minor: number;
}

export interface VoiceInfo {
  name: string;
  language: string;
  country: string;
  gender: number;
}

export interface VoicePackage {
  id: string;
  kind: "voice";
  name: string;
  ctry2code?: string;
  ctry3code?: string;
  accent?: string;
  version: PackageVersion;
  dataUrl: string;
  sha256: string;
  size: number;
  dependsOn?: string[];
}

export interface LanguagePackage {
  id: string;
  kind: "language";
  name: string;
  lang2code: string;
  lang3code: string;
  testMessage: string;
  version: PackageVersion;
  dataUrl: string;
  sha256: string;
  size: number;
  dataOnly?: boolean;
  voices: VoicePackage[];
}

export interface Registry {
  version: number;
  coreAbi: string;
  generatedAt: string;
  languages: LanguagePackage[];
  defaultVoices: Record<string, Record<string, string>>;
}

export type SitePreloadPolicy = "on-demand" | "all-at-init";

export interface RhvoiceSiteConfig {
  version: number;
  generatedAt: string;
  assetBasePath: string;
  registryUrl: string;
  defaultVoiceByLocale: Record<string, string>;
  fallbackVoice: string;
  preloadPolicy: SitePreloadPolicy;
  preloadVoices: string[];
}

export interface InstalledPackage {
  id: string;
  kind: "language" | "voice";
  name: string;
  version: PackageVersion;
  path: string;
  parentLanguageId?: string;
}

export interface InstalledState {
  packages: Record<string, InstalledPackage>;
}

export interface InstallVoiceOptions {
  force?: boolean;
}

export interface InitOptions {
  registryUrl?: string;
}

export interface CatalogVoiceEntry {
  language: LanguagePackage;
  voice: VoicePackage;
}

export type PackageInstallAction = "Install" | "Update" | "Reinstall";

export interface SynthRequest {
  text: string;
  voice: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  messageType?: number;
}

export interface SiteSynthRequest {
  text: string;
  locale?: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  messageType?: number;
}

export interface SynthResult {
  sampleRate: number;
  pcm: Int16Array;
}

export interface RhvoiceModule {
  FS: any;
  IDBFS?: any;
  HEAP16: Int16Array;
  UTF8ToString(ptr: number): string;
  ccall(identifier: string, returnType: string | null, argTypes?: string[], args?: unknown[]): any;
}

export interface InitPayload {
  registry: Registry;
  installed: InstalledState;
  voices: VoiceInfo[];
}

export interface RhvoiceSnapshot {
  registry: Registry;
  installed: InstalledState;
  voices: VoiceInfo[];
}

export interface PackageOperationPayload {
  installed: InstalledState;
  voices: VoiceInfo[];
}

export interface RpcMessage<T = unknown> {
  requestId?: string;
  type: "response" | "progress";
  ok?: boolean;
  result?: T;
  error?: string;
  message?: string;
}
