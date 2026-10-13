import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { vocabulary } from "../fixtures/dictionary";
import { dayKey } from "../../src/domain/vocabulary";

test("flip, add and edit a Thai meaning without reloading another card", async ({
  page,
}) => {
  await page.goto("/");
  for (const word of ["rescind", "serene"]) {
    await page.getByLabel("Word", { exact: true }).fill(word);
    await page.getByLabel("Word", { exact: true }).press("Enter");
    await expect(
      page.getByRole("heading", { name: word, exact: true }),
    ).toBeVisible();
  }
  const secondHeading = page.getByRole("heading", {
    name: "serene",
    exact: true,
  });
  await secondHeading.evaluate((node) => {
    node.setAttribute("data-preserved", "yes");
  });
  const reloads: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.isNavigationRequest() ||
      (path === "/api/words" && request.method() === "GET")
    )
      reloads.push(request.url());
  });
  const flip = page.getByRole("button", { name: "Flip rescind card" });
  await flip.click();
  await expect(flip).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Add a word", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Thai meaning for rescind" });
  await expect(input).toBeFocused();
  await expect(page.locator('button[type="submit"]')).toHaveCount(0);
  await input.fill("ยกเลิกคำสั่งหรือข้อตกลง");
  await input.press("Enter");
  await expect(
    page.getByText("ยกเลิกคำสั่งหรือข้อตกลง", { exact: true }),
  ).toBeVisible();
  await expect(flip).toBeFocused();
  await expect(secondHeading).toHaveAttribute("data-preserved", "yes");
  await expect(page.getByText("2 / 2 words", { exact: true })).toBeVisible();
  expect(reloads).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await flip.click();
  await expect(
    page.getByRole("heading", { name: "rescind", exact: true }),
  ).toBeVisible();
  await flip.click();
  await expect(
    page.getByText("ยกเลิกคำสั่งหรือข้อตกลง", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Thai meaning for rescind" })
    .click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("ยกเลิกคำสั่งหรือข้อตกลง");
  await input.fill("เพิกถอน");
  await input.press("Enter");
  await expect(page.getByText("เพิกถอน", { exact: true })).toBeVisible();
  await expect(secondHeading).toHaveAttribute("data-preserved", "yes");
  expect(reloads).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: "Flip rescind card" }).click();
  await expect(page.getByText("เพิกถอน", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Thai input preserves composing Enter and supports cancellation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByLabel("Word", { exact: true }).fill("rescind");
  await page.getByLabel("Word", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Flip rescind card" }).click();
  expect(
    await page
      .locator(".flip-card-rotor")
      .evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
  await page.getByRole("button", { name: "Add a word", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Thai meaning for rescind" });
  await input.fill("ยกเลิก");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("ยกเลิก");
  await input.press("Escape");
  await expect(
    page.getByRole("button", { name: "Add a word", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add a word", exact: true }).click();
  await expect(input).toHaveValue("");
  await input.fill("ยกเลิก");
  await input.press("Enter");
  await expect(page.getByText("ยกเลิก", { exact: true })).toBeVisible();
});

test("expanded details retain their height and audio controls through a real flip", async ({
  page,
}, info) => {
  await page.addInitScript(
    ({ entry, today }) =>
      localStorage.setItem(
        "two-words-demo-v2",
        JSON.stringify([{ ...entry, day: today }]),
      ),
    { entry: vocabulary, today: dayKey() },
  );
  await page.goto("/");
  await page.getByText("1 more meaning", { exact: true }).click();
  await page.getByText("More pronunciations", { exact: true }).click();
  await page.getByText("Verb forms", { exact: true }).click();
  const card = page.locator(".flip-card");
  const front = page.getByRole("heading", { name: "ought", exact: true });
  const before = await card.boundingBox();
  await page.getByRole("button", { name: "Flip ought card" }).click();
  const rotatingFrames = await page
    .locator(".flip-card-rotor")
    .evaluate(async (node) => {
      const samples: number[] = [];
      const until = performance.now() + 650;
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame);
        samples.push(
          new DOMMatrixReadOnly(getComputedStyle(node).transform).m11,
        );
      }
      return samples;
    });
  expect(rotatingFrames.some((value) => value > -0.95 && value < 0.95)).toBe(
    true,
  );
  await expect(front).toBeHidden();
  const after = await card.boundingBox();
  expect(after?.height).toBe(before?.height);
  await page.getByRole("button", { name: "Add a word", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Thai meaning for ought" });
  await input.fill("ควรทำสิ่งที่ถูกต้อง หรือสิ่งที่จำเป็น");
  await input.press("Enter");
  await expect(
    page.getByText("ควรทำสิ่งที่ถูกต้อง หรือสิ่งที่จำเป็น", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `docs/flip-${info.project.name}-back.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Flip ought card" }).click();
  await expect(front).toBeVisible();
  await expect(
    page.getByText("They ought to arrive soon.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play ought UK" }),
  ).toBeVisible();
  await expect(page.locator(".verb-forms dd")).toHaveText("ought");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `docs/flip-${info.project.name}-front.png`,
    fullPage: true,
  });
});
