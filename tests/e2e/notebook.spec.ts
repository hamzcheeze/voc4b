import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /เพิ่มคำศัพท์/ })).toHaveCount(
    1,
  );
});
test("zero → one → two, persistence, history and demo reset", async ({
  page,
}) => {
  await expect(page.getByText("เดโม", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /เพิ่มคำศัพท์/ }).click();
  await page.getByLabel("คำศัพท์", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /เพิ่มคำศัพท์/ })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: /เพิ่มคำศัพท์/ }).click();
  await page.getByLabel("คำศัพท์", { exact: true }).fill("serene");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByRole("button", { name: /เพิ่มคำศัพท์/ })).toHaveCount(
    0,
  );
  await expect(page.getByText("2 / 2 คำ")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /เพิ่มคำศัพท์/ })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: /คลังคำศัพท์/ }).click();
  await expect(
    page.getByRole("heading", { name: "คลังคำศัพท์" }),
  ).toBeVisible();
  await page.getByLabel("ช่วงเวลา", { exact: true }).selectOption("year");
  await page.getByLabel("ปี (ค.ศ.)", { exact: true }).fill("1900");
  await expect(page.getByText("ไม่มีคำศัพท์ในช่วงนี้")).toBeVisible();
  await page.getByRole("button", { name: "ล้างตัวกรอง" }).click();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await page.getByLabel("เรียงลำดับ").selectOption("asc");
  const ascending = await page
    .locator(".history-day-heading h2")
    .allTextContents();
  await page.getByLabel("เรียงลำดับ").selectOption("desc");
  expect(
    await page.locator(".history-day-heading h2").allTextContents(),
  ).toEqual([...ascending].reverse());
  await page.getByText("เดโม", { exact: true }).click();
  await expect(page.getByText("ไม่ได้เรียก AI หรือ Supabase")).toBeVisible();
  await page.getByRole("button", { name: "ล้างเดโม" }).click();
  await page.getByRole("link", { name: /วันนี้/ }).click();
  await expect(page.getByRole("button", { name: /เพิ่มคำศัพท์/ })).toHaveCount(
    1,
  );
});
test("transparent unsupported word, focus, no slot consumption", async ({
  page,
}) => {
  await page.getByRole("button", { name: /เพิ่มคำศัพท์/ }).click();
  await expect(page.getByLabel("คำศัพท์", { exact: true })).toBeFocused();
  await page.getByLabel("คำศัพท์", { exact: true }).fill("gibberish");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "เดโม",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /เพิ่มคำศัพท์/ }),
  ).toBeFocused();
  await expect(page.getByText("0 / 2 คำ")).toBeVisible();
});
test("accessible desktop/mobile, stress has stronger weight and color", async ({
  page,
}, testInfo) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: /เพิ่มคำศัพท์/ }).click();
  await page.getByLabel("คำศัพท์", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.locator("strong.stressed")).toHaveText("sind");
  const colors = await page.locator(".pronunciation p").evaluate((el) => ({
    normal: getComputedStyle(el.querySelector("span")!).color,
    strong: getComputedStyle(el.querySelector("strong")!).color,
    weight: getComputedStyle(el.querySelector("strong")!).fontWeight,
  }));
  expect(colors.strong).not.toEqual(colors.normal);
  expect(Number(colors.weight)).toBeGreaterThanOrEqual(700);
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
  await page.getByRole("button", { name: "เปลี่ยนเป็นโหมดมืด" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "เปลี่ยนเป็นโหมดสว่าง" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "เพิ่มคำศัพท์", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("คำศัพท์", { exact: true }).fill("rescind");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.locator("strong.stressed")).toHaveText("sind");
  const palette = await page
    .locator("body,.stressed,.meaning .thai,.pronunciation p,.brand")
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
  await page.getByRole("link", { name: "คลังคำศัพท์" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "เปลี่ยนเป็นโหมดสว่าง" }).click();
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
  await page.getByRole("button", { name: "เปลี่ยนเป็นโหมดมืด" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
