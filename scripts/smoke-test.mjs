import { unzipSync } from "fflate";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import createRhvoiceModule from "../src/generated/native/rhvoice_core.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = resolve(rootDir, "public", "rhvoice", "registry", "packages.json");
const artifactsDir = resolve(rootDir, "artifacts");

if (!existsSync(registryPath)) {
  throw new Error("Registry is missing. Run `npm run bundle` first, or prepare bundle assets before running smoke.");
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const language = registry.languages[0];
const voice = language.voices[0];
const artifactName = `smoke-${voice.id}.wav`;

const module = await createRhvoiceModule();
const FS = module.FS;

function ensureDir(path) {
  if (!FS.analyzePath(path).exists) {
    FS.mkdirTree(path);
  }
}

function unpack(zipFilePath, targetPath) {
  ensureDir(targetPath);
  const archive = unzipSync(new Uint8Array(readFileSync(zipFilePath)));
  for (const [entryName, bytes] of Object.entries(archive)) {
    const normalized = entryName.replace(/\\/g, "/");
    const outputPath = `${targetPath}/${normalized.replace(/\/$/, "")}`;
    if (normalized.endsWith("/")) {
      ensureDir(outputPath);
      continue;
    }
    ensureDir(outputPath.slice(0, outputPath.lastIndexOf("/")));
    FS.writeFile(outputPath, bytes);
  }
}

const languageZipPath = resolve(rootDir, "public", language.dataUrl.replace(/^\//, ""));
const voiceZipPath = resolve(rootDir, "public", voice.dataUrl.replace(/^\//, ""));
const languagePath = `/rhvoice/packs/language/${language.id}@${language.version.major}.${language.version.minor}`;
const voicePath = `/rhvoice/packs/voice/${voice.id}@${voice.version.major}.${voice.version.minor}`;

unpack(languageZipPath, languagePath);
unpack(voiceZipPath, voicePath);

let pcmPtr;
let pcmSize;
let sampleRate;
let pcm;

try {
  const initOk = module.ccall("rhvoice_web_init", "number", ["string"], [[languagePath, voicePath].join("\n")]);
  if (initOk !== 1) {
    const errorPtr = module.ccall("rhvoice_web_get_last_error", "number", [], []);
    throw new Error(module.UTF8ToString(errorPtr));
  }

  const voicesPtr = module.ccall("rhvoice_web_list_voices_json", "number", [], []);
  const voices = JSON.parse(module.UTF8ToString(voicesPtr));
  console.log("Available voices:", voices);

  const text = "Hello from the RHVoice WebAssembly smoke test.";
  const speakOk = module.ccall(
    "rhvoice_web_speak_text",
    "number",
    ["string", "string", "number", "number", "number", "number"],
    [text, voice.name, 0, 0, 0, 0],
  );

  if (speakOk !== 1) {
    const errorPtr = module.ccall("rhvoice_web_get_last_error", "number", [], []);
    throw new Error(module.UTF8ToString(errorPtr));
  }

  pcmPtr = module.ccall("rhvoice_web_get_last_pcm_ptr", "number", [], []);
  pcmSize = module.ccall("rhvoice_web_get_last_pcm_size", "number", [], []);
  sampleRate = module.ccall("rhvoice_web_get_last_sample_rate", "number", [], []);
  pcm = new Int16Array(module.HEAP16.buffer, pcmPtr, pcmSize);
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error("Smoke synthesis failed:", detail);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}

function pcmToWav(int16, hz) {
  const headerSize = 44;
  const dataSize = int16.length * 2;
  const output = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(output);
  const ascii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, hz, true);
  view.setUint32(28, hz * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < int16.length; index += 1) {
    view.setInt16(44 + index * 2, int16[index], true);
  }

  return Buffer.from(output);
}

mkdirSync(artifactsDir, { recursive: true });
writeFileSync(resolve(artifactsDir, artifactName), pcmToWav(new Int16Array(pcm), sampleRate));

console.log(`Wrote artifacts/${artifactName} with ${pcmSize} samples at ${sampleRate} Hz.`);
