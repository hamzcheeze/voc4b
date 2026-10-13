import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import nextEnv from "@next/env";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
if (!args.includes("--url") || !args.includes("--output"))
  throw new Error(
    "Usage: bun scripts/measure-performance.mjs --url http://localhost:3002 --output /tmp/performance.json [--words rescind,serene,ambush,cite,misery]",
  );
const base = new URL(option("--url"));
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Only a local production build may be measured.");
const words = option("--words", "rescind,serene,ambush,cite,misery").split(",");
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Configure Supabase in .env.local.");
const adapter = SupabaseAdapter({ url, secret });
const admin = createClient(url, secret, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
let account;
let browser;
const runs = [];
const failures = [];
try {
  account = await adapter.createUser({
    id: randomUUID(),
    email: `perf-${randomUUID()}@example.com`,
    name: "Temporary performance account",
    emailVerified: null,
  });
  const token = randomUUID();
  await adapter.createSession({
    sessionToken: token,
    userId: account.id,
    expires: new Date(Date.now() + 400 * 86400000),
  });
  const headers = {
    Cookie: `authjs.session-token=${token}`,
    Origin: base.origin,
    "Content-Type": "application/json",
  };
  const seed = await fetch(new URL("/api/words", base), {
    method: "POST",
    headers,
    body: JSON.stringify({ word: "ought" }),
  });
  if (seed.status !== 201)
    throw new Error(
      `Seed failed (${seed.status}): ${(await seed.json()).error}`,
    );
  browser = await chromium.launch({ headless: true });
  for (const word of words) {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "authjs.session-token", value: token, url: base.origin },
    ]);
    const page = await context.newPage();
    const requests = [];
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfinished", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/"))
        requests.push({
          method: request.method(),
          path: new URL(request.url()).pathname,
        });
    });
    await page.addInitScript(() => {
      globalThis.__perfHome = new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => {
          observer.disconnect();
          reject(new Error("Home did not render within 40 seconds."));
        }, 40000);
        const observer = new globalThis.MutationObserver(check);
        function check() {
          if (
            [...globalThis.document.querySelectorAll(".word-title")].some(
              (node) => node.textContent === "ought",
            )
          ) {
            observer.disconnect();
            globalThis.clearTimeout(timer);
            globalThis.requestAnimationFrame(() =>
              resolve(globalThis.performance.now()),
            );
          }
        }
        observer.observe(globalThis.document, {
          childList: true,
          subtree: true,
        });
        check();
      });
    });
    await page.goto(base.href, { waitUntil: "domcontentloaded" });
    const homeMs = await page.evaluate(() => globalThis.__perfHome);
    await page.getByRole("heading", { name: "ought", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Word" }).fill(word);
    const beforeSave = requests.length;
    const postResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/words",
    );
    await page.evaluate((word) => {
      globalThis.__perfAdd = new Promise((resolve, reject) => {
        let started;
        const timer = globalThis.setTimeout(() => {
          observer.disconnect();
          reject(new Error("Word did not render within 40 seconds."));
        }, 40000);
        const observer = new globalThis.MutationObserver(() => {
          if (
            started !== undefined &&
            (!globalThis.document.querySelector("#new-word") ||
              globalThis.document.querySelector("#new-word").value === "") &&
            [...globalThis.document.querySelectorAll(".word-title")].some(
              (node) => node.textContent === word,
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
          { once: true, capture: true },
        );
      });
    }, word);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const response = await postResponse;
    const body = await response.json();
    if (response.status() !== 201)
      throw new Error(`Save failed (${response.status()}): ${body.error}`);
    await page.getByRole("heading", { name: word, exact: true }).waitFor();
    await page
      .getByRole("textbox", { name: "Word" })
      .waitFor({ state: "hidden" });
    const addMs = await page.evaluate(() => globalThis.__perfAdd);
    const row = await admin
      .from("vocabulary")
      .select("id,word,day,created_at,content")
      .eq("user_id", account.id)
      .eq("id", body.entry.id)
      .single();
    if (
      row.error ||
      row.data?.word !== word ||
      !isDeepStrictEqual(row.data?.content, body.entry.content)
    )
      throw new Error(
        "Saved dictionary data did not match the database read-back.",
      );
    if (pageErrors.length)
      throw new Error(`Browser error: ${pageErrors.join("; ")}`);
    runs.push({
      word,
      homeMs,
      addMs,
      requestsBeforeSave: requests.slice(0, beforeSave),
      requestsAfterSave: requests.slice(beforeSave),
      verifiedWrite: true,
    });
    const removed = await fetch(
      new URL(`/api/words?id=${encodeURIComponent(body.entry.id)}`, base),
      { method: "DELETE", headers },
    );
    if (removed.status !== 204)
      throw new Error("Temporary vocabulary cleanup failed.");
    await context.close();
  }
} catch (error) {
  failures.push(
    error instanceof Error ? error.message : "The measurement failed.",
  );
} finally {
  await browser?.close();
  if (account) {
    try {
      await adapter.deleteUser(account.id);
      if (await adapter.getUser(account.id))
        failures.push("Temporary account cleanup failed.");
    } catch {
      failures.push("Temporary account cleanup failed.");
    }
  }
}
const summarize = (key) => {
  const values = runs.map((run) => run[key]).sort((a, b) => a - b);
  return {
    count: values.length,
    medianMs: values[Math.floor(values.length / 2)],
    minMs: values[0],
    maxMs: values.at(-1),
  };
};
const result = {
  base: base.origin,
  runtime: "Bun production build",
  home: summarize("homeMs"),
  add: summarize("addMs"),
  runs,
  failures,
};
writeFileSync(option("--output"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
