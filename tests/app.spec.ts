import { expect, test } from "@playwright/test";

test("installs, reinstalls, synthesizes, and removes voice packages", async ({ page }) => {
  const statusLog = page.locator("#status-log");
  const installedPackages = page.locator("#installed-packages");
  const voiceSelect = page.locator("#voice-select");
  const player = page.locator("#player");

  await page.goto("/");
  await expect(statusLog).toContainText("Worker is ready.");
  await expect(page.locator("#voice-catalog")).toContainText("Alan for English");
  await expect(page.locator("#voice-catalog")).toContainText("Anna for Russian");

  const alanCard = page.locator(".catalog-item", { hasText: "Alan for English" });
  await alanCard.getByRole("button", { name: "Install" }).click();
  await expect(installedPackages).toContainText("language: English v2.17");
  await expect(installedPackages).toContainText("voice: Alan v4.0");
  await expect(alanCard.getByRole("button", { name: "Reinstall" })).toBeVisible();

  await alanCard.getByRole("button", { name: "Reinstall" }).click();
  await expect(statusLog).toContainText("Reinstalling Alan...");

  await voiceSelect.selectOption("Alan");
  await page.locator("#text-input").fill("Playwright is driving the RHVoice browser demo.");
  await page.getByRole("button", { name: "Synthesize" }).click();
  await expect(statusLog).toContainText("Synthesis complete.");
  await expect
    .poll(async () => player.evaluate((node) => node.getAttribute("src") ?? ""))
    .toMatch(/^blob:/);

  const annaCard = page.locator(".catalog-item", { hasText: "Anna for Russian" });
  await annaCard.getByRole("button", { name: "Install" }).click();
  await expect(installedPackages).toContainText("language: Russian v2.17");
  await expect(installedPackages).toContainText("voice: Anna v4.1");

  const englishLanguageChip = page.locator(".chip", { hasText: "language: English v2.17" });
  await englishLanguageChip.getByRole("button", { name: "Remove" }).click();
  await expect(statusLog).toContainText("Cannot remove language English while voices are installed: Alan.");

  const alanVoiceChip = page.locator(".chip", { hasText: "voice: Alan v4.0" });
  await alanVoiceChip.getByRole("button", { name: "Remove" }).click();
  await expect(installedPackages).not.toContainText("voice: Alan v4.0");

  await englishLanguageChip.getByRole("button", { name: "Remove" }).click();
  await expect(installedPackages).not.toContainText("language: English v2.17");
  await expect(installedPackages).toContainText("voice: Anna v4.1");
  await expect(installedPackages).toContainText("language: Russian v2.17");
});
