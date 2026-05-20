/// <reference lib="webworker" />

import createRhvoiceModule from "../generated/native/rhvoice_core.js";
import { PackageManager } from "../lib/package-manager";
import { loadRegistry } from "../lib/registry";
import { RhvoiceRuntime } from "../lib/rhvoice-runtime";
import type {
  InitOptions,
  InitPayload,
  PackageOperationPayload,
  Registry,
  RhvoiceModule,
  RpcMessage,
  SynthRequest,
  VoiceInfo,
} from "../lib/types";

type WorkerState = {
  module: RhvoiceModule;
  registry: Registry;
  packageManager: PackageManager;
  runtime: RhvoiceRuntime;
};

type BootOptions = {
  registryUrl: string;
};

const DEFAULT_REGISTRY_URL = "/rhvoice/registry/packages.json";

let bootPromise: Promise<WorkerState> | null = null;
let bootOptions: BootOptions | null = null;

function exists(module: RhvoiceModule, path: string): boolean {
  return module.FS.analyzePath(path).exists as boolean;
}

function ensureDir(module: RhvoiceModule, path: string): void {
  if (!exists(module, path)) {
    module.FS.mkdirTree(path);
  }
}

async function syncfs(module: RhvoiceModule, populate: boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    module.FS.syncfs(populate, (error: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function normalizeBootOptions(options: InitOptions = {}): BootOptions {
  return {
    registryUrl: options.registryUrl ?? DEFAULT_REGISTRY_URL,
  };
}

async function bootstrap(options: BootOptions): Promise<WorkerState> {
  const module = (await createRhvoiceModule()) as RhvoiceModule;
  const idbfs = module.FS?.filesystems?.IDBFS;
  if (!idbfs) {
    throw new Error("The wasm build is missing IDBFS support. Rebuild the native core with -lidbfs.js.");
  }
  ensureDir(module, "/rhvoice");
  module.FS.mount(idbfs, {}, "/rhvoice");
  await syncfs(module, true);

  const registry = await loadRegistry(options.registryUrl);
  const packageManager = new PackageManager(module, registry);
  await packageManager.initialize();
  const runtime = new RhvoiceRuntime(module);

  return { module, registry, packageManager, runtime };
}

async function getState(options: InitOptions = {}): Promise<WorkerState> {
  if (!bootPromise) {
    const nextOptions = normalizeBootOptions(options);
    bootOptions = nextOptions;
    bootPromise = bootstrap(nextOptions);
    return bootPromise;
  }

  if (options.registryUrl && bootOptions && bootOptions.registryUrl !== options.registryUrl) {
    throw new Error(
      `The RHVoice worker is already initialized with ${bootOptions.registryUrl}. Create a new SDK instance to switch registries.`,
    );
  }
  return bootPromise;
}

async function refreshVoices(state: WorkerState): Promise<VoiceInfo[]> {
  state.runtime.shutdown();
  const resourcePaths = state.packageManager.getInstalledResourcePaths();
  if (resourcePaths.length === 0) {
    return [];
  }
  state.runtime.init(resourcePaths);
  return state.runtime.listVoices();
}

function progress(requestId: string | undefined, message: string): void {
  const response: RpcMessage = {
    requestId,
    type: "progress",
    message,
  };
  self.postMessage(response);
}

async function handleInit(options: InitOptions = {}): Promise<InitPayload> {
  const state = await getState(options);
  const voices = await refreshVoices(state);
  return {
    registry: state.registry,
    installed: state.packageManager.getInstalledState(),
    voices,
  };
}

async function handleInstallVoice(
  requestId: string | undefined,
  voiceId: string,
  force: boolean,
): Promise<PackageOperationPayload> {
  const state = await getState();
  state.runtime.shutdown();
  const installed = await state.packageManager.installVoice(voiceId, (message) => progress(requestId, message), { force });
  const voices = await refreshVoices(state);
  return { installed, voices };
}

async function handleUninstallPackage(
  requestId: string | undefined,
  packageId: string,
): Promise<PackageOperationPayload> {
  const state = await getState();
  state.runtime.shutdown();
  const installed = await state.packageManager.uninstallPackage(packageId, (message) => progress(requestId, message));
  const voices = await refreshVoices(state);
  return { installed, voices };
}

async function handleSynthesize(payload: SynthRequest): Promise<SynthResultLike> {
  const state = await getState();
  const voices = await refreshVoices(state);
  if (voices.length === 0) {
    throw new Error("No installed voices are available. Install the sample pack first.");
  }
  const result = state.runtime.synthesize(payload);
  return {
    sampleRate: result.sampleRate,
    pcm: result.pcm.buffer,
  };
}

type SynthResultLike = {
  sampleRate: number;
  pcm: ArrayBufferLike;
};

self.addEventListener("message", async (event: MessageEvent<Record<string, unknown>>) => {
  const { requestId, action } = event.data;

  try {
    let result: InitPayload | PackageOperationPayload | SynthResultLike;
    switch (action) {
      case "init":
        result = await handleInit(event.data as unknown as InitOptions);
        break;
      case "installVoice":
        result = await handleInstallVoice(
          requestId as string | undefined,
          event.data.voiceId as string,
          Boolean(event.data.force),
        );
        break;
      case "uninstallPackage":
        result = await handleUninstallPackage(requestId as string | undefined, event.data.packageId as string);
        break;
      case "synthesize":
        result = await handleSynthesize(event.data as unknown as SynthRequest);
        break;
      default:
        throw new Error(`Unknown worker action: ${String(action)}`);
    }

    const response: RpcMessage = {
      requestId: requestId as string | undefined,
      type: "response",
      ok: true,
      result,
    };

    if (action === "synthesize") {
      self.postMessage(response, [(result as SynthResultLike).pcm]);
    } else {
      self.postMessage(response);
    }
  } catch (error) {
    const response: RpcMessage = {
      requestId: requestId as string | undefined,
      type: "response",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
});
