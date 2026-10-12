// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { CambridgeDictionary } from "../src/adapters/dictionary";
import { dictionaryEntry } from "./fixtures/dictionary";

const cambridge = readFileSync(
  new URL("./fixtures/cambridge.html", import.meta.url),
  "utf8",
);
const wiktionary = readFileSync(
  new URL("./fixtures/wiktionary.html", import.meta.url),
  "utf8",
);
function pages(html = cambridge, forms = wiktionary) {
  const fetcher = vi.fn(
    async (url: URL) =>
      new Response(url.hostname === "dictionary.cambridge.org" ? html : forms),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("preserves the pinned original senses, examples, sources, pronunciations and forms", async () => {
  pages();
  const entry = await new CambridgeDictionary().lookup("Ought");
  expect(entry).toEqual(dictionaryEntry);
  expect(JSON.stringify(entry)).not.toContain("translation");
  expect(JSON.stringify(entry)).not.toContain("derived word");
});
it("reads fixed upstream origins directly with lowercase word paths", async () => {
  vi.stubEnv("DICTIONARY_API_URL", "https://obsolete.example");
  const fetcher = pages();
  expect(await new CambridgeDictionary().lookup(" Ought ")).toEqual(
    dictionaryEntry,
  );
  expect(fetcher.mock.calls.map(([url]) => url.href)).toEqual([
    "https://dictionary.cambridge.org/us/dictionary/english/ought",
    "https://simple.wiktionary.org/wiki/ought",
  ]);
});
it.each(["../ought", "ought to", "https://evil.example", "คำไทย", ""])(
  "rejects invalid input before fetching %s",
  async (word) => {
    const fetcher = pages();
    await expect(new CambridgeDictionary().lookup(word)).rejects.toThrow(
      /one English word/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("keeps meanings when pronunciation and source are absent", async () => {
  const html =
    '<span class="hw dhw">ought</span><div class="def-block ddef_block"><div class="def ddef_d db">A useful English meaning.</div></div>';
  pages(html, "");
  expect(await new CambridgeDictionary().lookup("ought")).toEqual({
    headword: "ought",
    partsOfSpeech: [],
    pronunciations: [],
    definitions: [
      {
        id: "0",
        pos: "",
        source: "",
        text: "A useful English meaning.",
        examples: [],
      },
    ],
    verbForms: [],
  });
});
it.each([
  "<html>blocked</html>",
  cambridge.replace("ought to", "different"),
  cambridge.replace(/Used to say[^<]+/g, " "),
  cambridge.replace("Used to say what is necessary or right.", "คำแปลไทย"),
  cambridge.replace(
    "/media/english/uk_pron/ought.mp3",
    "https://evil.example/audio.mp3",
  ),
])("rejects malformed, empty, unrelated or unsafe HTML", async (html) => {
  pages(html);
  await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow();
});
it("resolves absolute Cambridge audio URLs", async () => {
  pages(
    cambridge.replace(
      "/media/english/uk_pron/ought.mp3",
      "https://dictionary.cambridge.org/media/english/uk_pron/ought.mp3",
    ),
  );
  expect(await new CambridgeDictionary().lookup("ought")).toEqual(
    dictionaryEntry,
  );
});
it.each([404, 403, 429, 500])(
  "rejects Cambridge HTTP %i without fallback data",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("blocked", { status })),
    );
    await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow(
      status === 404 ? /Word not found/ : /unavailable/,
    );
  },
);
it("reports connection failure without caching it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("private upstream diagnostic")),
  );
  const provider = new CambridgeDictionary();
  await expect(provider.lookup("ought")).rejects.toThrow(
    /reach the dictionary/,
  );
  pages();
  expect(await provider.lookup("ought")).toEqual(dictionaryEntry);
});
it("keeps Cambridge data when optional Wiktionary is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: URL) =>
        new Response(
          url.hostname === "dictionary.cambridge.org" ? cambridge : "",
          { status: url.hostname === "dictionary.cambridge.org" ? 200 : 404 },
        ),
    ),
  );
  expect(await new CambridgeDictionary().lookup("ought")).toEqual({
    ...dictionaryEntry,
    verbForms: [],
  });
});
it.each(["past<br>ought", "<b>past</b><br><a>ought</a>", "past<br/>ought"])(
  "extracts Wiktionary line break forms %s",
  async (content) => {
    pages(
      cambridge,
      `<table class="inflection-table"><tr><td><p>${content}</p></td></tr></table>`,
    );
    expect(await new CambridgeDictionary().lookup("ought")).toEqual(
      dictionaryEntry,
    );
  },
);
it("follows a Cambridge redirect while preserving the requested headword", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      if (url.hostname === "simple.wiktionary.org")
        return new Response(wiktionary);
      return url.pathname.endsWith("/ought")
        ? new Response(null, {
            status: 302,
            headers: { location: "/us/dictionary/english/ought-to" },
          })
        : new Response(cambridge);
    }),
  );
  expect(await new CambridgeDictionary().lookup("ought")).toEqual(
    dictionaryEntry,
  );
});
it.each([
  "https://evil.example/ought",
  "http://dictionary.cambridge.org/ought",
  "https://user:pass@dictionary.cambridge.org/ought",
])("rejects unsafe redirect %s", async (location) => {
  const fetcher = vi.fn(
    async () => new Response(null, { status: 302, headers: { location } }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow(
    /unavailable/,
  );
  expect(fetcher.mock.calls).toHaveLength(2);
});
it("bounds redirect loops", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(null, { status: 302, headers: { location: "/loop" } }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow(
    /unavailable/,
  );
  expect(fetcher.mock.calls).toHaveLength(12);
});
it.each([true, false])(
  "rejects oversized HTML with declared length %s",
  async (declared) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("x".repeat(2 * 1024 * 1024 + 1), {
            headers: declared
              ? { "Content-Length": String(2 * 1024 * 1024 + 1) }
              : {},
          }),
      ),
    );
    await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow(
      /invalid or incomplete data/,
    );
  },
);
it("times out a response that sends headers but stalls its HTML body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ReadableStream<Uint8Array>())),
  );
  const result = new CambridgeDictionary().lookup("ought");
  const assertion = expect(result).rejects.toThrow(/reach the dictionary/);
  await vi.advanceTimersByTimeAsync(10000);
  await assertion;
});
it("reuses successful entries for 30 minutes and then refreshes their content", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
  pages();
  const provider = new CambridgeDictionary();
  expect(await provider.lookup("ought")).toEqual(dictionaryEntry);
  pages(cambridge.replace("You ought to apologize.", "You ought to return."));
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000 - 1);
  expect(await provider.lookup("OUGHT")).toEqual(dictionaryEntry);
  await vi.advanceTimersByTimeAsync(1);
  const refreshed = await provider.lookup("ought");
  expect(refreshed.definitions[0].examples[0].text).toBe(
    "You ought to return.",
  );
});

it("reports malformed audio URL as a dictionary data error", async () => {
  pages(cambridge.replace("/media/english/uk_pron/ought.mp3", "http://["));
  await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow(
    /invalid or incomplete data/,
  );
});
it("evicts the oldest success after 1,000 cached words", async () => {
  const provider = new CambridgeDictionary();
  pages();
  expect(await provider.lookup("ought")).toEqual(dictionaryEntry);
  for (let index = 0; index < 1000; index++) {
    const suffix =
      String.fromCharCode(97 + Math.floor(index / 676)) +
      String.fromCharCode(97 + (Math.floor(index / 26) % 26)) +
      String.fromCharCode(97 + (index % 26));
    const word = `word${suffix}`;
    pages(cambridge.replace("ought to", word));
    expect((await provider.lookup(word)).headword).toBe(word);
  }
  pages(cambridge.replace("You ought to apologize.", "You ought to return."));
  expect((await provider.lookup("ought")).definitions[0].examples[0].text).toBe(
    "You ought to return.",
  );
});
