import type { RhvoiceModule, SynthRequest, SynthResult, VoiceInfo } from "./types";

export class RhvoiceRuntime {
  constructor(private readonly module: RhvoiceModule) {}

  init(resourcePaths: string[]): void {
    const ok = this.module.ccall("rhvoice_web_init", "number", ["string"], [resourcePaths.join("\n")]) as number;
    if (ok !== 1) {
      throw new Error(this.getLastError());
    }
  }

  shutdown(): void {
    this.module.ccall("rhvoice_web_shutdown", null, [], []);
  }

  listVoices(): VoiceInfo[] {
    const ptr = this.module.ccall("rhvoice_web_list_voices_json", "number", [], []) as number;
    if (!ptr) {
      throw new Error(this.getLastError());
    }
    return JSON.parse(this.module.UTF8ToString(ptr)) as VoiceInfo[];
  }

  synthesize(request: SynthRequest): SynthResult {
    const ok = this.module.ccall(
      "rhvoice_web_speak_text",
      "number",
      ["string", "string", "number", "number", "number", "number"],
      [
        request.text,
        request.voice,
        request.rate ?? 0,
        request.pitch ?? 0,
        request.volume ?? 0,
        request.messageType ?? 0,
      ],
    ) as number;

    if (ok !== 1) {
      throw new Error(this.getLastError());
    }

    const ptr = this.module.ccall("rhvoice_web_get_last_pcm_ptr", "number", [], []) as number;
    const sampleCount = this.module.ccall("rhvoice_web_get_last_pcm_size", "number", [], []) as number;
    const sampleRate = this.module.ccall("rhvoice_web_get_last_sample_rate", "number", [], []) as number;

    if (!ptr || sampleCount === 0 || sampleRate === 0) {
      throw new Error("RHVoice returned an empty PCM buffer.");
    }

    const pcmView = new Int16Array(this.module.HEAP16.buffer, ptr, sampleCount);
    return {
      sampleRate,
      pcm: new Int16Array(pcmView),
    };
  }

  private getLastError(): string {
    const ptr = this.module.ccall("rhvoice_web_get_last_error", "number", [], []) as number;
    if (!ptr) {
      return "Unknown RHVoice runtime error.";
    }
    const message = this.module.UTF8ToString(ptr);
    return message || "Unknown RHVoice runtime error.";
  }
}
