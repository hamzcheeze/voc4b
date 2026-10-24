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
const phrasal = readFileSync(
  new URL("./fixtures/cambridge-phrasal.html", import.meta.url),
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
it("reads phrasal verb meanings and Cambridge base-verb pronunciations", async () => {
  pages(phrasal, "");
  const entry = await new CambridgeDictionary().lookup("wear off");
  expect(entry).toEqual({
    headword: "wear off",
    partsOfSpeech: ["phrasal verb", "verb"],
    pronunciations: [
      {
        pos: "phrasal verb",
        region: "us",
        ipa: "/wer/",
        audioUrl:
          "https://dictionary.cambridge.org/us/media/english/us_pron/e/eus/eus74/eus74948.mp3",
      },
      {
        pos: "phrasal verb",
        region: "uk",
        ipa: "/weər/",
        audioUrl:
          "https://dictionary.cambridge.org/us/media/english/uk_pron/u/ukw/ukwax/ukwaxwo028.mp3",
      },
    ],
    definitions: [
      {
        id: "0",
        pos: "phrasal verb",
        source: "cald4",
        text: "If a feeling or the effect of something wears off, it gradually disappears:",
        examples: [
          {
            id: "0",
            text: "Most patients find that the numbness from the injection wears off after about an hour.",
          },
        ],
      },
    ],
    verbForms: [],
  });
});
it("keeps a nested phrasal verb's part of speech separate from its parent entry", async () => {
  pages(
    phrasal.replace(
      '<div class="entry-body__el clrd js-share-holder">',
      '<div class="entry-body__el clrd js-share-holder"><span class="pos dpos">noun</span>',
    ),
    "",
  );
  const entry = await new CambridgeDictionary().lookup("wear off");
  expect(entry.definitions[0].pos).toBe("phrasal verb");
  expect(entry.pronunciations.map(({ pos }) => pos)).toEqual([
    "phrasal verb",
    "phrasal verb",
  ]);
});
it.each(["https://evil.example/audio.mp3", "http://["])(
  "rejects unsafe phrasal verb audio %s",
  async (audioUrl) => {
    pages(
      phrasal.replace(
        "/us/media/english/us_pron/e/eus/eus74/eus74948.mp3",
        audioUrl,
      ),
      "",
    );
    await expect(new CambridgeDictionary().lookup("wear off")).rejects.toThrow(
      /invalid or incomplete data/,
    );
  },
);
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
it.each(["../ought", "https://evil.example", "คำไทย", ""])(
  "rejects invalid input before fetching %s",
  async (word) => {
    const fetcher = pages();
    await expect(new CambridgeDictionary().lookup(word)).rejects.toThrow(
      /English dictionary term/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it.each(["rocket science", "cliché", "omni-"])(
  "fetches a historical dictionary term %s",
  async (term) => {
    const fetcher = pages(cambridge.replace("ought to", term));
    const entry = await new CambridgeDictionary().lookup(term);
    expect(entry.headword).toBe(term);
    expect(fetcher.mock.calls[0][0].href).toBe(
      `https://dictionary.cambridge.org/us/dictionary/english/${encodeURIComponent(term.replace(/ /g, "-"))}`,
    );
  },
);
it("reads the phrasal verb rather than a joined noun when a term contains spaces", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: URL) =>
        new Response(
          url.hostname !== "dictionary.cambridge.org"
            ? ""
            : url.pathname.endsWith("/turn-down")
              ? '<span class="hw dhw">turn something/someone down</span><div class="def-block ddef_block"><div class="def ddef_d db">to refuse an offer or request:</div></div>'
              : '<span class="hw dhw">turndown</span><div class="def-block ddef_block"><div class="def ddef_d db">a fold or reduction:</div></div>',
        ),
    ),
  );
  const entry = await new CambridgeDictionary().lookup("turn down");
  expect(entry.headword).toBe("turn something/someone down");
  expect(entry.definitions[0].text).toBe("to refuse an offer or request:");
});
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

it("joins simultaneous lookups of the same normalized word", async () => {
  const fetcher = pages();
  const dictionary = new CambridgeDictionary();
  const entries = await Promise.all([
    dictionary.lookup("ought"),
    dictionary.lookup(" OUGHT "),
    dictionary.lookup("Ought"),
  ]);
  expect(entries).toEqual([dictionaryEntry, dictionaryEntry, dictionaryEntry]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("releases a failed shared lookup so the next attempt can succeed", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  const dictionary = new CambridgeDictionary();
  const results = await Promise.allSettled([
    dictionary.lookup("ought"),
    dictionary.lookup("OUGHT"),
  ]);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  pages();
  expect(await dictionary.lookup("ought")).toEqual(dictionaryEntry);
});

it("bounds concurrent distinct lookups without blocking a matching in-flight word", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    async () => new Response(new ReadableStream<Uint8Array>()),
  );
  vi.stubGlobal("fetch", fetcher);
  const dictionary = new CambridgeDictionary();
  const first = dictionary.lookup("ought");
  const requests = [first];
  for (let index = 0; index < 31; index++) {
    requests.push(
      dictionary.lookup(
        `word${String.fromCharCode(97 + (index % 26))}${String.fromCharCode(97 + Math.floor(index / 26))}`,
      ),
    );
  }
  requests.push(dictionary.lookup("OUGHT"));
  const settlement = Promise.allSettled(requests);
  await expect(dictionary.lookup("different")).rejects.toThrow(/busy/);
  expect(fetcher).toHaveBeenCalledTimes(64);
  await vi.advanceTimersByTimeAsync(10000);
  expect(
    (await settlement).every((result) => result.status === "rejected"),
  ).toBe(true);
  pages();
  expect(await dictionary.lookup("ought")).toEqual(dictionaryEntry);
});
it("preserves Cambridge collocation examples without a sentence span", async () => {
  pages(
    '<span class="hw dhw">equity</span><div class="pr dictionary" data-id="cald4"><div class="pr entry-body__el"><span class="pos dpos">noun</span><div class="def-block ddef_block"><div class="def ddef_d db">the situation in which everyone is treated fairly and equally:</div><div class="def-body ddef_b"><div class="examp dexamp"><span class="lu dlu">social equity</span> </div><div class="examp dexamp"><span class="eg deg">The issue of social equity is important.</span></div></div></div></div></div>',
    "",
  );
  const entry = await new CambridgeDictionary().lookup("equity");
  expect(entry.definitions[0].examples).toEqual([
    { id: "0", text: "social equity" },
    { id: "1", text: "The issue of social equity is important." },
  ]);
});
it("reads standalone Cambridge phrase entries such as shingles", async () => {
  pages(
    '<div class="pr dictionary" data-id="cald4"><div class="idiom-block"><div class="di-title"><h2 class="headword tw-bw dhw dpos-h_hw"><b>shingles</b></h2></div><span class="di-info"><span class="pos dpos">phrase</span></span><span class="phrase-di-body dphrase-di-body"><div class="def-block ddef_block"><div class="def ddef_d db">a disease caused by the varicella zoster virus:</div><div class="def-body ddef_b"><div class="examp dexamp"><span class="eg deg">Later that year he contracted shingles.</span></div></div></div></span></div></div>',
    "",
  );
  expect(await new CambridgeDictionary().lookup("shingles")).toEqual({
    headword: "shingles",
    partsOfSpeech: ["phrase"],
    pronunciations: [],
    definitions: [
      {
        id: "0",
        pos: "phrase",
        source: "cald4",
        text: "a disease caused by the varicella zoster virus:",
        examples: [
          { id: "0", text: "Later that year he contracted shingles." },
        ],
      },
    ],
    verbForms: [],
  });
});
