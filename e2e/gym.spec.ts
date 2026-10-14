import { expect, test } from "@playwright/test";

test("onboarding, then registering and managing gym equipment", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("radio", { name: "Strength" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Gym name").fill("Test Gym");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  // Starter templates were registered.
  await page.getByRole("link", { name: "Gym", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My gym" })).toBeVisible();
  await expect(page.getByText("Lat pulldown", { exact: false }).first()).toBeVisible();

  // Custom machine in under a minute: name → keyword suggestion → save.
  await page.getByRole("button", { name: "Add equipment" }).click();
  await page.getByRole("radio", { name: "Custom machine" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Technogym Selection Pec Deck");
  await expect(page.getByText(/Looks like a selectorized machine/)).toBeVisible();
  await page.getByRole("button", { name: "Use this" }).click();
  await expect(
    page.getByRole("group", { name: "Linked exercises" }).or(page.getByLabel("Linked exercises")),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save machine" }).click();
  const pecDeck = page.getByRole("button", { name: /Technogym Selection Pec Deck/ });
  await expect(pecDeck).toBeVisible();

  // Mark it broken: shown greyed out with a "broken since" badge.
  await pecDeck.click();
  await page.getByRole("radio", { name: "Broken" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: /Technogym Selection Pec Deck/ })).toContainText(
    "Broken since",
  );

  // Check my gym reports gaps only.
  await page.getByRole("link", { name: "Check my gym" }).click();
  await expect(page.getByRole("heading", { name: /Check Test Gym/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gaps" })).toBeVisible();

  // Exercises: search and exclude (reversible).
  await page.getByRole("link", { name: "Exercises" }).click();
  await page.getByLabel("Search exercises").fill("leg extension");
  await page.getByRole("button", { name: /^Leg Extension/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Exclude", exact: true }).click();
  await expect(page.getByText("Never programmed while excluded")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Excluded", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Leg Extension/ })).toBeVisible();
});
