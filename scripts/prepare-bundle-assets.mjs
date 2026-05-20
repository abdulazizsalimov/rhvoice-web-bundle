import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getArgValue, normalizeBasePath, readBundleConfig, rootDir } from "./release-utils.mjs";

const publicDir = resolve(rootDir, "public");
const officialPackagesBase = "https://raw.githubusercontent.com/RHVoice/packages/main/src/languages";
const { bundleConfig } = readBundleConfig(getArgValue("--config"));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sanitizeSegment(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function versionLabel(version) {
  return `${version.major}.${version.minor}`;
}

function basenameFromUrl(url) {
  return new URL(url).pathname.split("/").pop() ?? "";
}

function localArchiveName(kind, namespace, version, sourceUrl) {
  const basename = basenameFromUrl(sourceUrl);
  if (basename && basename !== "data.zip") {
    return basename;
  }
  return `RHVoice-${kind}-${sanitizeSegment(namespace)}-v${versionLabel(version)}.zip`;
}

function normalizeLocale(locale) {
  return locale.trim().toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values));
}

function clampSynthValue(value) {
  return Math.max(-1, Math.min(1, value));
}

function normalizeDefaultSynthOptions(options) {
  if (!options || typeof options !== "object") {
    return {};
  }

  const normalized = {};
  for (const key of ["rate", "pitch", "volume"]) {
    const value = options[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      normalized[key] = clampSynthValue(value);
    }
  }
  return normalized;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function downloadIfNeeded(url, filePath) {
  if (existsSync(filePath)) {
    return;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(filePath, Buffer.from(arrayBuffer));
}

function toSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function toSize(filePath) {
  return statSync(filePath).size;
}

function assetPath(basePath, ...segments) {
  return `${basePath}/${segments.join("/")}`;
}

const assetBasePath = normalizeBasePath(bundleConfig.assetBasePath);
const assetRootDir = resolve(publicDir, assetBasePath.slice(1));
const packsDir = resolve(assetRootDir, "packs");
const registryDir = resolve(assetRootDir, "registry");

rmSync(resolve(publicDir, "packs"), { recursive: true, force: true });
rmSync(resolve(publicDir, "registry"), { recursive: true, force: true });
rmSync(assetRootDir, { recursive: true, force: true });

mkdirSync(packsDir, { recursive: true });
mkdirSync(registryDir, { recursive: true });

async function buildVoice(languageSelection, languageId, voiceCode) {
  const voiceMeta = await fetchJson(`${officialPackagesBase}/${languageSelection.code}/voices/${voiceCode}.json`);
  const fileName = localArchiveName("voice", `${languageId}-${voiceCode}`, voiceMeta.version, voiceMeta.dataUrl);
  const archivePath = resolve(packsDir, fileName);
  await downloadIfNeeded(voiceMeta.dataUrl, archivePath);

  return {
    id: voiceCode,
    kind: "voice",
    name: voiceMeta.name,
    ctry2code: voiceMeta.ctry2code,
    ctry3code: voiceMeta.ctry3code,
    accent: voiceMeta.accent,
    version: voiceMeta.version,
    dataUrl: assetPath(assetBasePath, "packs", fileName),
    sha256: toSha256(archivePath),
    size: toSize(archivePath),
    dependsOn: [languageId],
  };
}

async function buildLanguage(languageSelection) {
  const [implMeta, languageMeta, officialDefaultVoices] = await Promise.all([
    fetchJson(`${officialPackagesBase}/${languageSelection.code}/impl.json`),
    fetchJson(`${officialPackagesBase}/${languageSelection.code}/language.json`),
    fetchJson(`${officialPackagesBase}/${languageSelection.code}/defaultVoices.json`),
  ]);

  const languageId = languageSelection.id ?? sanitizeSegment(implMeta.name);
  const languageFileName = localArchiveName("language", languageId, implMeta.version, implMeta.dataUrl);
  const languageArchivePath = resolve(packsDir, languageFileName);
  await downloadIfNeeded(implMeta.dataUrl, languageArchivePath);

  const voices = await Promise.all(languageSelection.voices.map((voiceCode) => buildVoice(languageSelection, languageId, voiceCode)));
  const defaultVoice = languageSelection.defaultVoice ?? officialDefaultVoices["*"] ?? voices[0]?.id;

  if (!voices.some((voice) => voice.id === defaultVoice)) {
    throw new Error(`Configured defaultVoice ${defaultVoice} is not present in language ${languageSelection.code}.`);
  }

  const locales = unique(
    [languageMeta.lang2code, ...(languageSelection.locales ?? [])].map((locale) => normalizeLocale(locale)),
  );

  return {
    registryEntry: {
      id: languageId,
      kind: "language",
      name: implMeta.name,
      lang2code: languageMeta.lang2code,
      lang3code: languageMeta.lang3code,
      testMessage: languageMeta.testMessage,
      version: implMeta.version,
      dataUrl: assetPath(assetBasePath, "packs", languageFileName),
      sha256: toSha256(languageArchivePath),
      size: toSize(languageArchivePath),
      dataOnly: Boolean(implMeta.dataOnly),
      voices,
    },
    defaultVoice,
    locales,
  };
}

const languages = await Promise.all(bundleConfig.languages.map((selection) => buildLanguage(selection)));

const generatedAt = new Date().toISOString();
const registry = {
  version: 1,
  coreAbi: "rhvoice-web/1",
  generatedAt,
  languages: languages.map(({ registryEntry }) => registryEntry),
  defaultVoices: Object.fromEntries(
    languages.map(({ registryEntry, defaultVoice }) => [registryEntry.lang2code, { "*": defaultVoice }]),
  ),
};

const localeVoiceEntries = languages.flatMap(({ locales, defaultVoice }) => locales.map((locale) => [locale, defaultVoice]));
const allowedVoiceIds = new Set(languages.flatMap(({ registryEntry }) => registryEntry.voices.map((voice) => voice.id)));
const configuredPreloadVoices = unique(bundleConfig.runtime?.preloadVoices ?? []);

for (const voiceId of configuredPreloadVoices) {
  if (!allowedVoiceIds.has(voiceId)) {
    throw new Error(`Configured preload voice ${voiceId} is not part of the selected language set.`);
  }
}

const fallbackVoice = bundleConfig.runtime?.fallbackVoice ?? languages[0]?.defaultVoice;
if (!allowedVoiceIds.has(fallbackVoice)) {
  throw new Error(`Configured fallback voice ${fallbackVoice} is not part of the selected language set.`);
}

const runtimeConfig = {
  version: 1,
  generatedAt,
  assetBasePath,
  registryUrl: assetPath(assetBasePath, "registry", "packages.json"),
  defaultVoiceByLocale: Object.fromEntries(localeVoiceEntries),
  fallbackVoice,
  preloadPolicy: bundleConfig.runtime?.preloadPolicy ?? "on-demand",
  preloadVoices: configuredPreloadVoices,
  defaultSynthOptions: normalizeDefaultSynthOptions(bundleConfig.runtime?.defaultSynthOptions),
};

writeFileSync(resolve(registryDir, "packages.json"), `${JSON.stringify(registry, null, 2)}\n`);
writeFileSync(resolve(assetRootDir, "config.json"), `${JSON.stringify(runtimeConfig, null, 2)}\n`);
