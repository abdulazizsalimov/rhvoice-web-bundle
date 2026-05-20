import type { RhvoiceSiteConfig } from "./types";

export function defaultSiteConfigUrl(): string {
  return new URL(
    /* @vite-ignore */ "../site-config.json",
    import.meta.url,
  ).href;
}

export async function loadSiteConfig(url = defaultSiteConfigUrl()): Promise<RhvoiceSiteConfig> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load RHVoice site config: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as RhvoiceSiteConfig;
}
