import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function getArgValue(flagName) {
  const index = process.argv.indexOf(flagName);
  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}.`);
  }

  return value;
}

export function resolveRootRelative(path) {
  return relative(rootDir, path).replace(/\\/g, "/");
}

export function normalizeBasePath(value) {
  if (!value) {
    return "/rhvoice";
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    throw new Error(`assetBasePath must start with '/'. Received: ${value}`);
  }

  const normalized = trimmed.replace(/\/+$/, "");
  return normalized || "/rhvoice";
}

export function assertBundleConfig(bundleConfig, configRef = "rhvoice.config.json") {
  if (!Array.isArray(bundleConfig.languages) || bundleConfig.languages.length === 0) {
    throw new Error(`${configRef} must define at least one language.`);
  }

  const preloadPolicy = bundleConfig.runtime?.preloadPolicy;
  if (preloadPolicy && preloadPolicy !== "on-demand" && preloadPolicy !== "all-at-init") {
    throw new Error(`Unsupported preloadPolicy in ${configRef}: ${preloadPolicy}`);
  }

  for (const language of bundleConfig.languages) {
    if (!language.code) {
      throw new Error(`Each language entry in ${configRef} must define "code".`);
    }
    if (!Array.isArray(language.voices) || language.voices.length === 0) {
      throw new Error(`Language ${language.code} in ${configRef} must define at least one voice.`);
    }
    if (language.defaultVoice && !language.voices.includes(language.defaultVoice)) {
      throw new Error(
        `Language ${language.code} in ${configRef} references missing defaultVoice ${language.defaultVoice}.`,
      );
    }
  }
}

export function readBundleConfig(configArg) {
  const candidate = configArg ?? "rhvoice.config.json";
  const configPath = resolve(rootDir, candidate);
  if (!existsSync(configPath)) {
    throw new Error(`Missing ${resolveRootRelative(configPath)}.`);
  }

  const bundleConfig = readJson(configPath);
  const configRef = resolveRootRelative(configPath);
  assertBundleConfig(bundleConfig, configRef);

  return {
    bundleConfig,
    configPath,
    configRef,
  };
}

export function readReleaseVariants(selectedVariantId) {
  const manifestPath = resolve(rootDir, "rhvoice.variants.json");
  if (!existsSync(manifestPath)) {
    return [];
  }

  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest.variants) || manifest.variants.length === 0) {
    throw new Error("rhvoice.variants.json must define at least one release variant.");
  }

  const variants = manifest.variants.map((variant) => {
    if (!variant.id) {
      throw new Error("Each release variant must define an id.");
    }
    if (!variant.config) {
      throw new Error(`Release variant ${variant.id} must define a config path.`);
    }

    const configPath = resolve(rootDir, variant.config);
    if (!existsSync(configPath)) {
      throw new Error(`Release variant ${variant.id} references missing config ${variant.config}.`);
    }

    return {
      id: variant.id,
      label: variant.label ?? variant.id,
      description: variant.description ?? "",
      config: variant.config,
      configPath,
    };
  });

  if (!selectedVariantId) {
    return variants;
  }

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  if (!selectedVariant) {
    throw new Error(`Unknown release variant: ${selectedVariantId}`);
  }

  return [selectedVariant];
}
