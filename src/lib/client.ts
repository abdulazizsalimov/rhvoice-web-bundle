import type {
  InitOptions,
  InitPayload,
  InstallVoiceOptions,
  PackageOperationPayload,
  RpcMessage,
  SynthRequest,
  SynthResult,
} from "./types";

export class RhvoiceWorkerClient {
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  onProgress?: (message: string) => void;

  constructor(private readonly worker: Worker) {
    this.worker.addEventListener("message", (event: MessageEvent<RpcMessage>) => {
      const data = event.data;
      if (data.type === "progress") {
        this.onProgress?.(data.message ?? "");
        return;
      }

      if (!data.requestId) {
        return;
      }

      const deferred = this.pending.get(data.requestId);
      if (!deferred) {
        return;
      }
      this.pending.delete(data.requestId);

      if (data.ok) {
        deferred.resolve(data.result);
      } else {
        deferred.reject(new Error(data.error ?? "Worker request failed."));
      }
    });
  }

  init(options: InitOptions = {}): Promise<InitPayload> {
    return this.request<InitPayload>("init", options);
  }

  installVoice(voiceId: string, options: InstallVoiceOptions = {}): Promise<PackageOperationPayload> {
    return this.request<PackageOperationPayload>("installVoice", { voiceId, ...options });
  }

  uninstallPackage(packageId: string): Promise<PackageOperationPayload> {
    return this.request<PackageOperationPayload>("uninstallPackage", { packageId });
  }

  async synthesize(payload: SynthRequest): Promise<SynthResult> {
    const result = await this.request<{ sampleRate: number; pcm: ArrayBufferLike }>("synthesize", payload);
    return {
      sampleRate: result.sampleRate,
      pcm: new Int16Array(result.pcm),
    };
  }

  private request<T>(action: string, payload: object = {}): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: (value) => resolve(value as T), reject });
      this.worker.postMessage({ requestId, action, ...payload });
    });
  }
}
