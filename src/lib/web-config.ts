import type { RhvoiceWebConfig } from "./types";

export function defaultWebConfigUrl(): string {
  return new URL(
    /* @vite-ignore */ "../config.json",
    import.meta.url,
  ).href;
}

export async function loadWebConfig(url = defaultWebConfigUrl()): Promise<RhvoiceWebConfig> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load RHVoice config: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as RhvoiceWebConfig;
}
