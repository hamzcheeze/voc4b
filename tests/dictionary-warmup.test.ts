// @vitest-environment node
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PUT, POST } from "../src/app/api/words/route";
import { dictionaryEntry } from "./fixtures/dictionary";
const ports = vi.hoisted(() => ({
  auth: vi.fn(),
  countToday: vi.fn(),
  hasWord: vi.fn(),
  save: vi.fn(),
}));
vi.mock("../src/auth", () => ({ auth: ports.auth }));
vi.mock("../src/adapters/supabase", () => ({
  serviceClient: vi.fn(),
  SupabaseRepository: class {
    countToday = ports.countToday;
    hasWord = ports.hasWord;
    save = ports.save;
  },
}));
const cambridge = readFileSync(
  new URL("./fixtures/cambridge.html", import.meta.url),
  "utf8",
);
const wiktionary = readFileSync(
  new URL("./fixtures/wiktionary.html", import.meta.url),
  "utf8",
);
let account = 0;
beforeEach(() => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  vi.stubEnv("AUTH_SECRET", "auth-secret");
  account++;
  ports.auth.mockResolvedValue({
    user: {
      id: `00000000-0000-4000-8000-${String(account).padStart(12, "0")}`,
    },
  });
  ports.countToday.mockResolvedValue(0);
  ports.hasWord.mockResolvedValue(false);
  ports.save.mockImplementation(async (word, content) => ({ word, content }));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function request(
  method: "PUT" | "POST",
  word: string,
  origin = "http://localhost:3000",
) {
  return new NextRequest("http://localhost:3000/api/words", {
    method,
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  });
}
function pages(word: string) {
  const fetcher = vi.fn(
    async (url: URL) =>
      new Response(
        url.hostname === "dictionary.cambridge.org"
          ? cambridge.replace("ought to", word)
          : wiktionary,
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
it("prepares complete dictionary content without writing, then save reuses it", async () => {
  const fetcher = pages("serene");
  expect((await PUT(request("PUT", "serene"))).status).toBe(204);
  expect(ports.save).not.toHaveBeenCalled();
  const saved = await POST(request("POST", "SERENE"));
  expect(saved.status).toBe(201);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(ports.save).toHaveBeenCalledWith("SERENE", {
    ...dictionaryEntry,
    headword: "serene",
  });
});
it("prepares and saves a phrase using the hyphenated Cambridge path", async () => {
  const fetcher = pages("wear off");
  expect((await PUT(request("PUT", " wear   off "))).status).toBe(204);
  expect(ports.save).not.toHaveBeenCalled();
  expect((await POST(request("POST", "wear off"))).status).toBe(201);
  expect(fetcher.mock.calls.map(([url]) => url.href)).toEqual([
    "https://dictionary.cambridge.org/us/dictionary/english/wear-off",
    "https://simple.wiktionary.org/wiki/wear%20off",
  ]);
  expect(ports.save).toHaveBeenCalledWith("wear off", {
    ...dictionaryEntry,
    headword: "wear off",
  });
});
it("does not expose preparation to anonymous callers", async () => {
  const fetcher = pages("anonymous");
  ports.auth.mockResolvedValue(null);
  expect((await PUT(request("PUT", "anonymous"))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
  expect(ports.countToday).not.toHaveBeenCalled();
});
it("rejects preparation from a foreign website before authentication", async () => {
  const fetcher = pages("foreign");
  expect(
    (await PUT(request("PUT", "foreign", "https://evil.example"))).status,
  ).toBe(403);
  expect(ports.auth).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([
  [2, false],
  [0, true],
])(
  "skips dictionary work when count is %i and duplicate is %s",
  async (count, duplicate) => {
    const fetcher = pages("unnecessary");
    ports.countToday.mockResolvedValue(count);
    ports.hasWord.mockResolvedValue(duplicate);
    expect((await PUT(request("PUT", "unnecessary"))).status).toBe(204);
    expect(fetcher).not.toHaveBeenCalled();
    expect(ports.save).not.toHaveBeenCalled();
  },
);
it("limits repeated preparations per authenticated user and allows the next interval", async () => {
  vi.useFakeTimers();
  pages("patient");
  expect((await PUT(request("PUT", "patient"))).status).toBe(204);
  expect((await PUT(request("PUT", "patient"))).status).toBe(429);
  await vi.advanceTimersByTimeAsync(2000);
  expect((await PUT(request("PUT", "patient"))).status).toBe(204);
});
it("does not trust a prepared word after the session is revoked", async () => {
  pages("revoked");
  expect((await PUT(request("PUT", "revoked"))).status).toBe(204);
  ports.auth.mockResolvedValue(null);
  expect((await POST(request("POST", "revoked"))).status).toBe(401);
  expect(ports.save).not.toHaveBeenCalled();
});
it("rechecks the daily limit before saving a prepared word", async () => {
  pages("limited");
  expect((await PUT(request("PUT", "limited"))).status).toBe(204);
  ports.countToday.mockResolvedValue(2);
  const response = await POST(request("POST", "limited"));
  expect(response.status).toBe(422);
  expect((await response.json()).error).toMatch(/two-word limit/);
  expect(ports.save).not.toHaveBeenCalled();
});
it("rejects invalid input without dictionary work", async () => {
  const fetcher = pages("invalid");
  expect((await PUT(request("PUT", "../ought"))).status).toBe(422);
  expect(fetcher).not.toHaveBeenCalled();
});

it("save joins an unfinished preparation and persists only after the complete lookup resolves", async () => {
  let finish: (response: Response) => void = () => {};
  const fetcher = vi.fn(async (url: URL) =>
    url.hostname === "dictionary.cambridge.org"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : new Response(wiktionary),
  );
  vi.stubGlobal("fetch", fetcher);
  const warmup = PUT(request("PUT", "concurrent"));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const save = POST(request("POST", "concurrent"));
  await vi.waitFor(() => expect(ports.countToday).toHaveBeenCalledTimes(2));
  expect(ports.save).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
  finish(new Response(cambridge.replace("ought to", "concurrent")));
  expect((await warmup).status).toBe(204);
  expect((await save).status).toBe(201);
  expect(ports.save).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("keeps one warmup per user in flight even after the cooldown", async () => {
  vi.useFakeTimers();
  let finish: (response: Response) => void = () => {};
  const fetcher = vi.fn(async (url: URL) =>
    url.hostname === "dictionary.cambridge.org"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : new Response(wiktionary),
  );
  vi.stubGlobal("fetch", fetcher);
  const warmup = PUT(request("PUT", "pending"));
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await PUT(request("PUT", "changed"))).status).toBe(429);
  finish(new Response(cambridge.replace("ought to", "pending")));
  expect((await warmup).status).toBe(204);
});
