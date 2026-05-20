import type { Registry } from "./types";

export async function loadRegistry(url = "/rhvoice/registry/packages.json"): Promise<Registry> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load registry: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Registry;
}
