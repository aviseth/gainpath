import { expect, test } from "@playwright/test";

test("check-in, generated session, logging, swapping and finishing", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByRole("radio", { name: "Muscle" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Gym name").fill("Home");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

  // Daily check-in (manual readiness provider).
  await page
    .getByRole("radiogroup", { name: "Sleep quality" })
    .getByRole("radio", { name: "4" })
    .click();
  await page.getByRole("radiogroup", { name: "Energy" }).getByRole("radio", { name: "4" }).click();
  await page.getByRole("button", { name: "Save check-in" }).click();

  // A deterministic session is generated with an explanation (no AI involved).
  await expect(page.getByRole("heading", { name: "Today's session" })).toBeVisible();
  await page.getByRole("button", { name: "Why does today look like this?" }).click();
  await expect(page.getByRole("dialog")).toContainText(/VOL-|READY-|PROG-/);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Ask Liftwise" })).toHaveCount(0);

  await page.getByRole("link", { name: "Start session" }).click();
  const first = page.locator("article").first();
  await expect(first).toBeVisible();

  // Skip warm-ups if shown, then log a working set with an RPE.
  await first
    .getByRole("radiogroup", { name: "RPE" })
    .getByRole("radio", { name: "8", exact: true })
    .click();
  await first.getByRole("button", { name: "Log set" }).click();
  await expect(page.getByText(/logged|Next set|Undo/i).first()).toBeVisible();
  await expect(first).toContainText("Set 1");

  // Swap the second exercise because the machine is busy.
  const second = page.locator("article").nth(1);
  await second.getByRole("button", { name: "Swap" }).click();
  await page.getByRole("button", { name: /Machine busy/ }).click();
  const useThis = page.getByRole("dialog").getByRole("button", { name: "Use this" }).first();
  const skipInstead = page
    .getByRole("dialog")
    .getByRole("button", { name: "Skip without replacing" });
  await expect(useThis.or(skipInstead).first()).toBeVisible();
  if (await useThis.count()) await useThis.click();
  else await skipInstead.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Done for today" })).toBeVisible();
});
