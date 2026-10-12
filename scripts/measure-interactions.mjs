import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import { chromium } from "playwright";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--url") || !args.includes("--output"))
  throw new Error("Provide --url and --output.");
const base = new URL(option("--url"));
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Local builds only.");
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const adapter = SupabaseAdapter({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  secret: process.env.SUPABASE_SECRET_KEY,
});
const browser = await chromium.launch();
const runs = [];
const words = args.includes("--words")
  ? option("--words").split(",")
  : ["serene", "ambush", "cite", "misery", "notorious"];
try {
  for (const word of words) {
    const account = await adapter.createUser({
      id: randomUUID(),
      email: `interaction-${randomUUID()}@example.com`,
      name: "Temporary interaction check",
      emailVerified: null,
    });
    const token = randomUUID();
    const context = await browser.newContext();
    try {
      await adapter.createSession({
        sessionToken: token,
        userId: account.id,
        expires: new Date(Date.now() + 86400000),
      });
      await context.addCookies([
        { name: "authjs.session-token", value: token, url: base.origin },
      ]);
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (req) => {
        const url = new URL(req.url());
        if (url.origin === base.origin)
          requests.push({
            method: req.method(),
            path: url.pathname,
            rsc: req.headers().rsc === "1",
          });
      });
      await page.goto(base.href);
      await page
        .getByRole("button", { name: "Add a word", exact: true })
        .waitFor();
      const timeClick = async (selector, expected) => {
        await page.evaluate(
          ({ selector, expected }) => {
            globalThis.__interaction = new Promise((resolve, reject) => {
              let started;
              const timer = globalThis.setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Did not display ${expected}`));
              }, 30000);
              const observer = new globalThis.MutationObserver(() => {
                if (
                  started !== undefined &&
                  [...globalThis.document.querySelectorAll("h1")].some((node) =>
                    node.textContent.includes(expected),
                  )
                ) {
                  observer.disconnect();
                  globalThis.clearTimeout(timer);
                  globalThis.requestAnimationFrame(() =>
                    resolve(globalThis.performance.now() - started),
                  );
                }
              });
              observer.observe(globalThis.document, {
                subtree: true,
                childList: true,
                attributes: true,
              });
              globalThis.document.querySelector(selector).addEventListener(
                "click",
                () => {
                  started = globalThis.performance.now();
                },
                { once: true, capture: true },
              );
            });
          },
          { selector, expected },
        );
        await page.locator(selector).click();
        return await page.evaluate(() => globalThis.__interaction);
      };
      const startNav = requests.length;
      const historyMs = await timeClick('nav a[href="/history"]', "History");
      const todayMs = await timeClick('nav a[href="/"]', "Today");
      await page.goBack();
      await page
        .getByRole("heading", { name: "History", exact: true })
        .waitFor();
      await page.goForward();
      await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
      const navigationRequests = requests.slice(startNav);
      await page.goto(new URL("/history", base).href);
      await page
        .getByRole("heading", { name: "History", exact: true })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", { name: "History", exact: true })
        .waitFor();
      await page.locator('nav a[href="/"]').click();
      await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Add a word", exact: true })
        .click();
      await page.getByRole("textbox", { name: "Word" }).fill(word);
      await page.waitForTimeout(1600);
      const saveResponse = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname === "/api/words",
      );
      await page.evaluate((word) => {
        globalThis.__saved = new Promise((resolve, reject) => {
          let started;
          const timer = globalThis.setTimeout(() => {
            observer.disconnect();
            reject(new Error("Save timed out"));
          }, 30000);
          const observer = new globalThis.MutationObserver(() => {
            if (
              started !== undefined &&
              !globalThis.document.querySelector(
                'dialog[aria-labelledby="add-title"]',
              ).open &&
              [...globalThis.document.querySelectorAll(".word-title")].some(
                (n) => n.textContent === word,
              )
            ) {
              observer.disconnect();
              globalThis.clearTimeout(timer);
              globalThis.requestAnimationFrame(() =>
                resolve(globalThis.performance.now() - started),
              );
            }
          });
          observer.observe(globalThis.document, {
            childList: true,
            subtree: true,
            attributes: true,
          });
          globalThis.document.addEventListener(
            "submit",
            () => {
              started = globalThis.performance.now();
            },
            { capture: true, once: true },
          );
        });
      }, word);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const saved = await saveResponse;
      if (saved.status() !== 201)
        throw new Error(`Save failed ${saved.status()}`);
      const addMs = await page.evaluate(() => globalThis.__saved);
      const persisted = await context.request.get(
        new URL("/api/words", base).href,
      );
      const persistedBody = await persisted.json();
      if (
        !persisted.ok() ||
        !persistedBody.entries.some(
          (entry) =>
            entry.word === word &&
            entry.content.kind === "dictionary" &&
            entry.content.entry.definitions.length > 0,
        )
      )
        throw new Error(
          "Saved dictionary entry was not readable from the database.",
        );
      const signedOutMs = await timeClick(
        ".account-tools button.text-button",
        "Sign in to",
      );
      await page
        .getByRole("button", { name: "Continue with Google" })
        .waitFor();
      await page.waitForFunction(
        () => !globalThis.document.querySelector(".oauth-button").disabled,
      );
      if (await adapter.getSessionAndUser(token))
        throw new Error("Session was not revoked.");
      const signInRequestsStart = requests.length;
      let departure;
      let signInStarted;
      await page.exposeFunction("recordSignInStart", (at) => {
        signInStarted = at;
      });
      const departed = new Promise((resolve) => {
        departure = resolve;
      });
      await page.route("https://accounts.google.com/**", async (route) => {
        departure(Date.now() - signInStarted);
        await route.abort();
      });
      await page.evaluate(() => {
        globalThis.document.querySelector(".oauth-button").addEventListener(
          "click",
          () => {
            void globalThis.recordSignInStart(Date.now());
          },
          { capture: true, once: true },
        );
      });
      await page.getByRole("button", { name: "Continue with Google" }).click();
      let departureTimer;
      const signInDepartureMs = await Promise.race([
        departed,
        new Promise((_, reject) => {
          departureTimer = globalThis.setTimeout(
            () => reject(new Error("Google departure timed out")),
            30000,
          );
        }),
      ]);
      globalThis.clearTimeout(departureTimer);
      if (errors.length) throw new Error(errors.join("; "));
      runs.push({
        word,
        historyMs,
        todayMs,
        addMs,
        signedOutMs,
        signInDepartureMs,
        navigationRequests,
        signInRequests: requests.slice(signInRequestsStart),
        sessionRevoked: true,
        saved: true,
        directHistoryAndReload: true,
      });
    } finally {
      await context.close();
      await adapter.deleteUser(account.id);
      if (await adapter.getUser(account.id)) {
        console.error("Temporary user cleanup failed.");
        process.exitCode = 1;
      }
    }
  }
} finally {
  await browser.close();
}
const summary = Object.fromEntries(
  ["historyMs", "todayMs", "addMs", "signedOutMs", "signInDepartureMs"].map(
    (key) => {
      const sorted = runs.map((r) => r[key]).sort((a, b) => a - b);
      return [
        key,
        {
          median: sorted[Math.floor(sorted.length / 2)],
          min: sorted[0],
          max: sorted.at(-1),
          count: sorted.length,
        },
      ];
    },
  ),
);
const result = { base: base.origin, inputPauseMs: 1600, summary, runs };
writeFileSync(option("--output"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(summary));
