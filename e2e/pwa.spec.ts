import { expect, test } from "@playwright/test";

test("installable manifest and offline training after the first visit", async ({
  page,
  context,
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);

  // First visit online: onboarding, and the service worker takes control.
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Gym name").fill("Garage");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /^(Morning|Afternoon|Evening)/ }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Offline: a cold load still opens the app with local data.
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: /^(Morning|Afternoon|Evening)/ }),
  ).toBeVisible();
  await page.goto("/gym");
  await expect(page.getByRole("heading", { name: "My gym" })).toBeVisible();
  await page.goto("/session");
  await expect(page.locator("main")).not.toContainText("You're offline");
  await context.setOffline(false);
});
