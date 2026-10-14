import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const backup = {
  format: "gainpath-backup",
  schema_version: 1,
  exported_at: Date.parse("2026-10-14T12:00:00Z"),
  owner_id: "local",
  tables: {
    gyms: [
      {
        id: "0199e3a0-0000-7000-8000-000000000001",
        user_id: "local",
        created_at: 1_760_000_000_000,
        updated_at: 1_760_000_000_000,
        deleted_at: null,
        name: "E2E gym",
        is_default: true,
      },
    ],
  },
};

const file = (name: string, content: string) => ({
  name,
  mimeType: "application/json",
  buffer: Buffer.from(content),
});

test("works local-only without Supabase configured", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("sync-indicator")).toHaveText(/Local only/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(/Cloud sync isn't set up/)).toBeVisible();
});

test("imports a backup, exports it back, and re-imports idempotently", async ({ page }) => {
  await page.goto("/settings");
  const input = page.getByTestId("import-input");

  await input.setInputFiles(file("backup.json", JSON.stringify(backup)));
  await expect(page.getByText("Imported 1 record.")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^gainpath-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.tables.gyms).toHaveLength(1);
  expect(exported.tables.gyms[0].name).toBe("E2E gym");

  await input.setInputFiles(file("again.json", JSON.stringify(exported)));
  await expect(page.getByText("Imported 0 records (1 already up to date).")).toBeVisible();

  // Data survives a reload (IndexedDB is the primary store).
  await page.reload();
  const again = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const reExported = JSON.parse(await readFile((await (await again).path())!, "utf8"));
  expect(reExported.tables.gyms[0].name).toBe("E2E gym");
});

test("rejects an invalid backup without importing anything", async ({ page }) => {
  await page.goto("/settings");
  const broken = structuredClone(backup);
  (broken.tables.gyms[0] as { name: string }).name = "";
  await page.getByTestId("import-input").setInputFiles(file("broken.json", JSON.stringify(broken)));
  await expect(page.getByText(/^Nothing was imported/)).toBeVisible();
});
