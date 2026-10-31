// Captures README screenshots from the real app with demo data and lays them
// out in rows. Usage (app running on BASE_URL, default :3200):
//
//   pnpm demo:data            # regenerates docs/screenshots/demo-backup.json
//   pnpm build && pnpm start -p 3200 &
//   pnpm screenshots
//
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a preinstalled Chromium.
import { mkdir, readFile } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const OUT = "docs/screenshots";
const RAW = `${OUT}/raw`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  ...devices["Pixel 7"],
  deviceScaleFactor: 2,
  colorScheme: "dark",
  serviceWorkers: "block",
});
const page = await context.newPage();
await mkdir(RAW, { recursive: true });
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${RAW}/${name}.png` });
  console.log("captured", name);
};

// Restore six weeks of engine-generated history through the app's own import.
await page.goto(`${BASE}/settings`);
await page.getByTestId("import-input").setInputFiles(`${OUT}/demo-backup.json`);
await page.getByText(/Imported \d+ records/).waitFor();

// Today: check-in, then the generated session.
await page.goto(`${BASE}/`);
await page.getByRole("heading", { level: 1, name: /^(Morning|Afternoon|Evening)/ }).waitFor();
const checkin = page.getByRole("button", { name: "Save check-in" });
if (await checkin.isVisible().catch(() => false)) {
  await shot("checkin");
  await page
    .getByRole("radiogroup", { name: "Sleep quality" })
    .getByRole("radio", { name: "4" })
    .click();
  await page.getByRole("radiogroup", { name: "Energy" }).getByRole("radio", { name: "4" }).click();
  await checkin.click();
}
await page.getByRole("heading", { name: "Today's path" }).waitFor();
await shot("today");

await page.getByRole("button", { name: "Why does today look like this?" }).click();
await page.getByRole("dialog").waitFor();
await shot("why");
await page.getByRole("button", { name: "Close" }).click();

// Live session: log two sets on the first exercise.
await page.getByRole("link", { name: /Start session|Continue session/ }).click();
const first = page.locator("article").first();
await first.waitFor();
for (const rpe of ["8", "8.5"]) {
  const log = first.getByRole("button", { name: "Log set" });
  if (!(await log.isVisible().catch(() => false))) break;
  await first
    .getByRole("radiogroup", { name: "RPE" })
    .getByRole("radio", { name: rpe, exact: true })
    .click();
  await log.click();
  await page.waitForTimeout(300);
}
// Skip the rest timer so the card is in view.
await page.evaluate(() => window.scrollTo(0, 0));
await shot("session");

// Swap: machine busy → engine-ranked alternatives.
await page.locator("article").nth(1).getByRole("button", { name: "Swap" }).click();
await page.getByRole("button", { name: /Machine busy/ }).click();
await page
  .getByText(/% match/)
  .first()
  .waitFor();
await shot("swap");
await page.getByRole("button", { name: "Close" }).click();

await page.goto(`${BASE}/progress`);
await page.getByTestId("e1rm-chart").waitFor();
await page.waitForTimeout(800);
await shot("progress");
await page.getByTestId("volume-chart").scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await shot("volume");

await page.goto(`${BASE}/gym`);
await page.getByRole("heading", { name: "My gym" }).waitFor();
await shot("gym");

await page.goto(`${BASE}/settings`);
await page.getByText("Engine constants").click();
await page.getByText("Engine constants").scrollIntoViewIfNeeded();
await shot("advanced");

// ---- frame them as phones ---------------------------------------------------
const dataUrl = async (name) =>
  `data:image/png;base64,${(await readFile(`${RAW}/${name}.png`)).toString("base64")}`;
const names = ["today", "session", "swap", "progress", "volume", "why", "gym", "advanced"];
const images = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await dataUrl(n)])));

const css = `
  * { box-sizing: border-box; margin: 0; }
  body { background: transparent; }
  .row { display: inline-flex; gap: 16px; padding: 4px; }
  img { width: 260px; height: auto; display: block; border-radius: 12px; border: 1px solid #c9c7bf; }
`;

async function render(file, shots) {
  const p = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
  const html = shots.map((n) => `<img src="${images[n]}" />`).join("");
  await p.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body><div id="root" class="row">${html}</div></body></html>`,
  );
  await p.locator("#root").screenshot({ path: `${OUT}/${file}.png`, omitBackground: true });
  await p.close();
  console.log("composed", file);
}

await render("screens", ["today", "session", "swap", "progress"]);
await render("screens-2", ["why", "volume", "gym", "advanced"]);

await browser.close();
