import type { SynthResult } from "./types";

export function synthResultToWav(result: SynthResult): Blob {
  const headerSize = 44;
  const dataSize = result.pcm.length * 2;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, result.sampleRate, true);
  view.setUint32(28, result.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < result.pcm.length; index += 1) {
    view.setInt16(headerSize + index * 2, result.pcm[index]!, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
