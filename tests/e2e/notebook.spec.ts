import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Add a word/ })).toHaveCount(1);
});
test("zero → one → two, persistence, history and demo reset", async ({
  page,
}) => {
  await expect(page.getByText("Demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Add a word/ }).click();
  await page.getByLabel("Word", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Add a word/ })).toHaveCount(1);
  await page.getByRole("button", { name: /Add a word/ }).click();
  await page.getByLabel("Word", { exact: true }).fill("serene");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /Add a word/ })).toHaveCount(0);
  await expect(page.getByText("2 / 2 words")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Add a word/ })).toHaveCount(0);
  await page.getByRole("link", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "History" }),
  ).toBeVisible();
  await page.getByLabel("Time period", { exact: true }).selectOption("year");
  await page.getByLabel("Year", { exact: true }).fill("1900");
  await expect(page.getByText("No words found for this period")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Sort order").selectOption("asc");
  const ascending = await page
    .locator(".history-day-heading h2")
    .allTextContents();
  await page.getByLabel("Sort order").selectOption("desc");
  expect(
    await page.locator(".history-day-heading h2").allTextContents(),
  ).toEqual([...ascending].reverse());
  await page.getByText("Demo", { exact: true }).click();
  await expect(
    page.getByText("No dictionary API or Supabase connection"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByRole("button", { name: /Add a word/ })).toHaveCount(1);
});
test("transparent unsupported word, focus, no slot consumption", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Add a word/ }).click();
  await expect(page.getByLabel("Word", { exact: true })).toBeFocused();
  await page.getByLabel("Word", { exact: true }).fill("gibberish");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Demo",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: /Add a word/ })).toBeFocused();
  await expect(page.getByText("0 / 2 words")).toBeVisible();
});
test("accessible desktop/mobile, IPA is visible without horizontal overflow", async ({
  page,
}, testInfo) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: /Add a word/ }).click();
  await page.getByLabel("Word", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".pronunciation p")).toHaveText("/rɪˈsɪnd/");
  await expect(page.locator(".part-of-speech")).toHaveText("verb");
  await expect(page.locator(".meaning .thai")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/preview-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("dark mode persists through navigation and reload, with readable monochrome content", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add a word", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Word", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".pronunciation p")).toHaveText("/rɪˈsɪnd/");
  const palette = await page
    .locator("body,.part-of-speech,.meaning p,.pronunciation p,.brand")
    .evaluateAll((nodes) => nodes.map((el) => getComputedStyle(el).color));
  for (const color of palette) {
    const [r, g, b] = color.match(/\d+/g)!.map(Number);
    expect(r).toBe(g);
    expect(g).toBe(b);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/preview-${testInfo.project.name}-dark.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("follows the system appearance until a preference is chosen", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
