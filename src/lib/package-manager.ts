import { unzipSync } from "fflate";

import type {
  InstallVoiceOptions,
  InstalledPackage,
  InstalledState,
  LanguagePackage,
  Registry,
  RhvoiceModule,
  VoicePackage,
} from "./types";

const EMPTY_STATE: InstalledState = { packages: {} };

function versionLabel(version: { major: number; minor: number }): string {
  return `${version.major}.${version.minor}`;
}

function dirname(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function packageActionLabel(action: "install" | "update" | "reinstall"): string {
  switch (action) {
    case "install":
      return "Installing";
    case "update":
      return "Updating";
    case "reinstall":
      return "Reinstalling";
  }
}

export class PackageManager {
  private readonly statePath: string;

  constructor(
    private readonly module: RhvoiceModule,
    private readonly registry: Registry,
    private readonly root = "/rhvoice",
  ) {
    this.statePath = `${this.root}/state/installed.json`;
  }

  async initialize(): Promise<InstalledState> {
    this.ensureDir(this.root);
    this.ensureDir(`${this.root}/packs`);
    this.ensureDir(`${this.root}/packs/language`);
    this.ensureDir(`${this.root}/packs/voice`);
    this.ensureDir(`${this.root}/state`);
    const state = this.readState();
    await this.writeState(state);
    return state;
  }

  async installVoice(
    voiceId: string,
    notify?: (message: string) => void,
    options: InstallVoiceOptions = {},
  ): Promise<InstalledState> {
    const resolved = this.findVoice(voiceId);
    const state = this.readState();
    const force = Boolean(options.force);

    const languageAction = this.resolveInstallAction(
      state.packages[resolved.language.id],
      this.installPath(resolved.language.kind, resolved.language.id, resolved.language.version),
      force,
    );
    if (languageAction) {
      notify?.(`${packageActionLabel(languageAction)} language ${resolved.language.name}...`);
      await this.installPackage(resolved.language, state, { force });
    }

    const voiceAction = this.resolveInstallAction(
      state.packages[resolved.voice.id],
      this.installPath(resolved.voice.kind, resolved.voice.id, resolved.voice.version),
      force,
    );
    if (voiceAction) {
      notify?.(`${packageActionLabel(voiceAction)} voice ${resolved.voice.name}...`);
      await this.installPackage(resolved.voice, state, {
        force,
        parentLanguageId: resolved.language.id,
      });
    }

    await this.writeState(state);
    return state;
  }

  async uninstallPackage(packageId: string, notify?: (message: string) => void): Promise<InstalledState> {
    const state = this.readState();
    const installed = state.packages[packageId];
    if (!installed) {
      throw new Error(`Package is not installed: ${packageId}`);
    }

    if (installed.kind === "language") {
      const dependents = this.findInstalledDependents(packageId, state);
      if (dependents.length > 0) {
        const names = dependents.map((entry) => entry.name).join(", ");
        throw new Error(`Cannot remove language ${installed.name} while voices are installed: ${names}.`);
      }
    }

    notify?.(`Removing ${installed.kind} ${installed.name}...`);
    this.removeTree(installed.path);
    delete state.packages[packageId];
    await this.writeState(state);
    return state;
  }

  getInstalledState(): InstalledState {
    return this.readState();
  }

  getInstalledResourcePaths(): string[] {
    const installed = Object.values(this.readState().packages);
    const languages = installed.filter((entry) => entry.kind === "language").map((entry) => entry.path);
    const voices = installed.filter((entry) => entry.kind === "voice").map((entry) => entry.path);
    return [...languages, ...voices];
  }

  private resolveInstallAction(
    current: InstalledPackage | undefined,
    targetPath: string,
    force: boolean,
  ): "install" | "update" | "reinstall" | null {
    if (!current) {
      return "install";
    }
    if (current.path !== targetPath) {
      return "update";
    }
    if (force) {
      return "reinstall";
    }
    return null;
  }

  private async installPackage(
    pkg: LanguagePackage | VoicePackage,
    state: InstalledState,
    options: {
      force?: boolean;
      parentLanguageId?: string;
    } = {},
  ): Promise<void> {
    const targetPath = this.installPath(pkg.kind, pkg.id, pkg.version);
    const current = state.packages[pkg.id];
    if (current?.path === targetPath && !options.force) {
      return;
    }

    const archive = await this.fetchArchive(pkg.dataUrl, pkg.sha256);
    const files = unzipSync(new Uint8Array(archive));

    if (current) {
      this.removeTree(current.path);
      delete state.packages[pkg.id];
    } else if (this.exists(targetPath)) {
      this.removeTree(targetPath);
    }

    this.ensureDir(targetPath);
    for (const [entryName, bytes] of Object.entries(files)) {
      const normalized = entryName.replace(/\\/g, "/");
      const outputPath = `${targetPath}/${normalized.replace(/\/$/, "")}`;
      if (normalized.endsWith("/")) {
        this.ensureDir(outputPath);
        continue;
      }
      this.ensureDir(dirname(outputPath));
      this.module.FS.writeFile(outputPath, bytes);
    }

    state.packages[pkg.id] = {
      id: pkg.id,
      kind: pkg.kind,
      name: pkg.name,
      version: pkg.version,
      path: targetPath,
      parentLanguageId: options.parentLanguageId,
    };
  }

  private async fetchArchive(url: string, expectedSha256: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const archive = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", archive);
    const actualSha256 = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

    if (actualSha256 !== expectedSha256) {
      throw new Error(`Checksum mismatch for ${url}`);
    }

    return archive;
  }

  private readState(): InstalledState {
    if (!this.exists(this.statePath)) {
      return structuredClone(EMPTY_STATE);
    }
    const contents = this.module.FS.readFile(this.statePath, { encoding: "utf8" }) as string;
    return JSON.parse(contents) as InstalledState;
  }

  private async writeState(state: InstalledState): Promise<void> {
    this.module.FS.writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`);
    await this.syncfs(false);
  }

  private findVoice(voiceId: string): { language: LanguagePackage; voice: VoicePackage } {
    for (const language of this.registry.languages) {
      const voice = language.voices.find((candidate) => candidate.id === voiceId);
      if (voice) {
        return { language, voice };
      }
    }
    throw new Error(`Voice package not found: ${voiceId}`);
  }

  private findInstalledDependents(languageId: string, state: InstalledState): InstalledPackage[] {
    return Object.values(state.packages).filter((entry) => entry.parentLanguageId === languageId);
  }

  private installPath(kind: "language" | "voice", id: string, version: { major: number; minor: number }): string {
    return `${this.root}/packs/${kind}/${id}@${versionLabel(version)}`;
  }

  private exists(path: string): boolean {
    return this.module.FS.analyzePath(path).exists as boolean;
  }

  private ensureDir(path: string): void {
    if (!this.exists(path)) {
      this.module.FS.mkdirTree(path);
    }
  }

  private removeTree(path: string): void {
    if (!this.exists(path)) {
      return;
    }

    const stat = this.module.FS.stat(path);
    if (this.module.FS.isDir(stat.mode)) {
      for (const entry of this.module.FS.readdir(path) as string[]) {
        if (entry === "." || entry === "..") {
          continue;
        }
        this.removeTree(`${path}/${entry}`);
      }
      this.module.FS.rmdir(path);
      return;
    }

    this.module.FS.unlink(path);
  }

  private async syncfs(populate: boolean): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.module.FS.syncfs(populate, (error: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}
