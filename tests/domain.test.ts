import { describe, it, expect } from "vitest";
import {
  dayKey,
  filterHistory,
  remainingSlots,
  validateWord,
  validateDictionaryTerm,
  dictionaryEntrySchema,
  matchesHeadword,
} from "../src/domain/vocabulary";
import { dictionaryEntry } from "./fixtures/dictionary";
const entry = (day: string, word = "rescind") => ({
  id: day + word,
  day,
  word,
  content: { kind: "dictionary" as const, entry: dictionaryEntry },
});
describe("historical dictionary terms", () => {
  it.each([
    [" money   siphoning ", "money siphoning"],
    ["rocket science", "rocket science"],
    ["in advance", "in advance"],
    ["grunt work", "grunt work"],
    ["rite of passage", "rite of passage"],
    ["aloe vera", "aloe vera"],
    ["cliché", "cliché"],
    ["cliche\u0301", "cliché"],
    ["mother-in-law", "mother-in-law"],
    ["someone's", "someone's"],
    ["omni-", "omni-"],
  ])("accepts the dictionary term %s", (input, expected) => {
    expect(validateDictionaryTerm(input)).toBe(expected);
  });
  it.each([
    "คำไทย",
    "hello\nworld",
    "word\u0000",
    "../word",
    "",
    "a".repeat(81),
  ])("rejects unsafe or non-English terms %s", (input) =>
    expect(() => validateDictionaryTerm(input)).toThrow(),
  );
  it("keeps accented terms restricted to historical dictionary lookup", () => {
    expect(() => validateWord("cliché")).toThrow();
  });
});
describe("Bangkok calendar and two-word policy", () => {
  it("changes day at Bangkok midnight, not UTC midnight", () => {
    expect(dayKey(new Date("2026-10-09T16:59:59Z"))).toBe("2026-10-09");
    expect(dayKey(new Date("2026-10-09T17:00:00Z"))).toBe("2026-10-10");
  });
  it.each([
    [0, 2],
    [1, 1],
    [2, 0],
    [3, 0],
  ])("remaining slots for %i saved", (saved, left) =>
    expect(remainingSlots(saved)).toBe(left),
  );
  it("accepts a single English word and trims it", () =>
    expect(validateWord(" Rescind ")).toBe("Rescind"));
  it.each([
    ["wear off", "wear off"],
    [" Wear   Off ", "Wear Off"],
    ["rocket science", "rocket science"],
    ["mother-in-law", "mother-in-law"],
    ["someone's cup of tea", "someone's cup of tea"],
    ["a ".repeat(39) + "aa", "a ".repeat(39) + "aa"],
  ])(
    "accepts and normalizes the English word or phrase %s",
    (input, expected) => {
      expect(validateWord(input)).toBe(expected);
    },
  );
  it.each([
    "",
    "Voc4b",
    "<script>",
    "123",
    "a".repeat(81),
    "a ".repeat(40) + "a",
    "wear\noff",
    "wear\toff",
    "wear off\n",
    "wear\u0000off",
    "wear/off",
    "wear - off",
    "wear--off",
    "wear off-",
  ])("rejects invalid input %s", (word) =>
    expect(() => validateWord(word)).toThrow(),
  );
});
describe("history filters", () => {
  const rows = [
    entry("2025-10-10"),
    entry("2026-09-10"),
    entry("2026-10-09"),
    entry("2026-10-10"),
  ];
  it("filters exact date", () =>
    expect(
      filterHistory(rows, { date: "2026-10-10", order: "desc" }),
    ).toHaveLength(1));
  it("filters month within year", () =>
    expect(
      filterHistory(rows, { month: "2026-10", order: "asc" }).map((x) => x.day),
    ).toEqual(["2026-10-09", "2026-10-10"]));
  it("filters year and orders newest first", () =>
    expect(filterHistory(rows, { year: "2026", order: "desc" })[0].day).toBe(
      "2026-10-10",
    ));
  it("rejects impossible dates rather than silently applying them", () =>
    expect(() =>
      filterHistory(rows, { date: "2026-02-30", order: "asc" }),
    ).toThrow());
});
describe("dictionary domain", () => {
  it("accepts all validated meanings and IPA", () =>
    expect(dictionaryEntrySchema.parse(dictionaryEntry)).toEqual(
      dictionaryEntry,
    ));
  it("rejects translation fields in stored data", () =>
    expect(
      dictionaryEntrySchema.safeParse({ ...dictionaryEntry, thai: "ignored" })
        .success,
    ).toBe(false));
  it("accepts canonical phrases for requested words", () =>
    expect(matchesHeadword(" Ought ", "ought  to")).toBe(true));
  it("rejects unrelated canonical words", () =>
    expect(matchesHeadword("ought", "bought")).toBe(false));
  it.each([
    ["turn down", "turn something/someone down"],
    ["blow up", "blow (someone/something) up"],
    ["stave-off", "stave something/someone off"],
    ["stave-off", "stave sth off"],
    ["rely-on", "rely on/upon someone/something"],
    ["rely upon", "rely on/upon something/someone"],
    ["stepping-stone", "stepping stone"],
    ["seabed", "the seabed"],
    ["turn down", "turn sb/sth down"],
    ["blend-in", "blend in/blend into something"],
    ["blend into", "blend in/blend into something"],
  ])("matches %s to Cambridge's heading %s", (word, headword) => {
    expect(matchesHeadword(word, headword)).toBe(true);
  });
  it.each([
    ["ought", "bought"],
    ["turn", "turn something/someone down"],
    ["blow", "blow (someone/something) up"],
    ["turn up", "turn something/someone down"],
    ["resign", "re-sign"],
    ["re-sign", "resign"],
    ["sea", "the seabed"],
    ["sea", "sea level"],
    ["curated", "curate"],
    ["upsides", "upside"],
    ["downsides", "downside"],
    ["unbound", "unbind"],
    ["blend", "blend in/blend into something"],
    ["blend out", "blend in/blend into something"],
  ])("rejects %s when Cambridge returns %s", (word, headword) => {
    expect(matchesHeadword(word, headword)).toBe(false);
  });
});

it("orders entries chronologically within the same day rather than alphabetically", () => {
  const early = {
    ...entry("2026-10-10", "zebra"),
    created_at: "2026-10-10T01:00:00Z",
  };
  const late = {
    ...entry("2026-10-10", "apple"),
    created_at: "2026-10-10T02:00:00Z",
  };
  expect(
    filterHistory([late, early], { order: "asc" }).map((x) => x.word),
  ).toEqual(["zebra", "apple"]);
  expect(
    filterHistory([early, late], { order: "desc" }).map((x) => x.word),
  ).toEqual(["apple", "zebra"]);
});
