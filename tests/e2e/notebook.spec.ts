import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Add$/ })).toHaveCount(1);
});
test("Today and History switch locally and support direct URLs and browser history", async ({
  page,
}) => {
  const navigations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.isNavigationRequest() ||
      url.searchParams.has("_rsc") ||
      url.pathname === "/api/words"
    )
      navigations.push(request.url());
  });
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page).toHaveURL(/\/history$/);
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  expect(navigations).toEqual([]);
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
});
test("zero → one → two, persistence, history and demo reset", async ({
  page,
}) => {
  await expect(page.getByText("Demo", { exact: true })).toBeVisible();
  await page.getByLabel("Word", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add$/ })).toHaveCount(1);
  await page.getByLabel("Word", { exact: true }).fill("serene");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Add$/ })).toHaveCount(0);
  await expect(page.getByText("2 / 2 words")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add$/ })).toHaveCount(0);
  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search words" });
  await search.fill("missingword");
  await expect(page.getByText("No words found for this search")).toBeVisible();
  await search.fill("rescind");
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "serene", exact: true }),
  ).toHaveCount(0);
  await search.clear();
  await expect(
    page.getByRole("heading", { name: "serene", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-day-heading")).toHaveCount(0);
  await page.getByText("Demo", { exact: true }).click();
  await expect(
    page.getByText("No dictionary API or Supabase connection"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByRole("button", { name: /^Add$/ })).toHaveCount(1);
});
test("transparent unsupported word, focus, no slot consumption", async ({
  page,
}) => {
  await page.getByLabel("Word", { exact: true }).fill("gibberish");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("form", { name: "Add" }).getByRole("alert"),
  ).toContainText("Demo");
  await expect(page.getByLabel("Word", { exact: true })).toHaveValue(
    "gibberish",
  );
  await expect(page.getByLabel("Word", { exact: true })).toBeFocused();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("0 / 2 words")).toBeVisible();
});
test("removing a word restores the inline form for a replacement", async ({
  page,
}) => {
  for (const word of ["rescind", "serene"]) {
    await page.getByLabel("Word", { exact: true }).fill(word);
    await page.getByLabel("Word", { exact: true }).press("Enter");
    await expect(
      page.getByRole("heading", { name: word, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("form", { name: "Add" })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove rescind", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Remove rescind?" })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  const input = page.getByLabel("Word", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("lucid");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "lucid", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 / 2 words")).toBeVisible();
  await expect(page.getByRole("form", { name: "Add" })).toHaveCount(0);
});
test("accessible desktop/mobile, IPA is visible without horizontal overflow", async ({
  page,
}, testInfo) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const input = page.getByLabel("Word", { exact: true });
  const add = page.getByRole("button", { name: "Add", exact: true });
  const inputBox = await input.boundingBox();
  const buttonBox = await add.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  if (!inputBox || !buttonBox) throw new Error("Add form is not visible.");
  if ((page.viewportSize()?.width ?? 0) <= 640) {
    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(buttonBox.y);
    expect(Math.abs(inputBox.width - buttonBox.width)).toBeLessThan(1);
  } else {
    expect(inputBox.x + inputBox.width).toBeLessThan(buttonBox.x);
    expect(Math.abs(inputBox.y - buttonBox.y)).toBeLessThan(1);
  }
  await page.getByLabel("Word", { exact: true }).fill("rescind");
  await input.press("Enter");
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
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Word", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "Add", exact: true }).click();
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
