import { afterEach, expect, it, vi } from "vitest";
import {
  CambridgeDictionary,
  parseDictionaryResponse,
} from "../src/adapters/dictionary";
import { dictionaryEntry, wireEntry } from "./fixtures/dictionary";
afterEach(() => vi.unstubAllGlobals());
it("preserves every sense, example, source, pronunciation and verb form while dropping translations", () => {
  expect(parseDictionaryResponse(wireEntry, "Ought")).toEqual(dictionaryEntry);
  expect(
    JSON.stringify(parseDictionaryResponse(wireEntry, "ought")),
  ).not.toContain("translation");
});
it("accepts missing pronunciation and source without inventing values", () => {
  const result = parseDictionaryResponse(
    {
      ...wireEntry,
      pronunciation: [],
      definition: [
        { id: 0, pos: "", text: "A useful English meaning.", example: [] },
      ],
    },
    "ought",
  );
  expect(result.pronunciations).toEqual([]);
  expect(result.definitions[0].source).toBe("");
});
it("keeps real serene meanings when the scraper includes a blank derived-word definition", () => {
  const result = parseDictionaryResponse(
    {
      word: "serene",
      pos: ["adjective", "noun"],
      pronunciation: [],
      verbs: [],
      definition: [
        {
          id: 0,
          pos: "adjective",
          source: "cald4-us",
          text: "peaceful and calm; worried by nothing: ",
          example: [{ id: 0, text: "She has a beautiful serene face." }],
        },
        {
          id: 2,
          pos: "adjective",
          source: "cacd",
          text: " ",
          example: [
            {
              id: 0,
              text: "He wrote of the beauty and serenity of the great river.",
            },
          ],
        },
      ],
    },
    "serene",
  );
  expect(result.definitions).toEqual([
    {
      id: "0",
      pos: "adjective",
      source: "cald4-us",
      text: "peaceful and calm; worried by nothing:",
      examples: [{ id: "0", text: "She has a beautiful serene face." }],
    },
  ]);
});
it.each([
  {},
  { ...wireEntry, definition: [] },
  {
    ...wireEntry,
    definition: [{ id: 0, pos: "verb", text: " ", example: [] }],
  },
  { ...wireEntry, word: "different" },
  {
    ...wireEntry,
    pronunciation: [
      {
        pos: "verb",
        lang: "us",
        pron: "/a/",
        url: "https://evil.example/audio.mp3",
      },
    ],
  },
  {
    ...wireEntry,
    definition: [{ id: 0, pos: "verb", text: "คำแปลไทย", example: [] }],
  },
])("rejects malformed, unrelated or unsafe response %j", (value) => {
  expect(() => parseDictionaryResponse(value, "ought")).toThrow();
});
it("looks up a lowercase escaped word through the configured API", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(wireEntry)));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new CambridgeDictionary("http://localhost:3001").lookup("Ought"),
  ).toEqual(dictionaryEntry);
  expect(fetcher.mock.calls[0][0].toString()).toBe(
    "http://localhost:3001/api/dictionary/en/ought",
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
});
it.each([404, 403, 500])("does not return data on HTTP %i", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status })),
  );
  await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow();
});
it("reports timeout and invalid JSON instead of providing a fallback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow(
    /ติดต่อพจนานุกรม/,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>blocked</html>")),
  );
  await expect(new CambridgeDictionary().lookup("ought")).rejects.toThrow(
    /รูปแบบ/,
  );
});
