import { describe, it, expect } from "vitest";
import {
  dayKey,
  filterHistory,
  remainingSlots,
  validateWord,
  enrichmentSchema,
} from "../src/domain/vocabulary";
const entry = (day: string, word = "rescind") => ({
  id: day + word,
  day,
  word,
  syllables: [
    { text: "ruh", stressed: false },
    { text: "sind", stressed: true },
  ],
  explanation: "To officially cancel a decision.",
  thai: "ยกเลิกการตัดสินใจอย่างเป็นทางการ",
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
  it.each(["", "two words", "<script>", "123", "a".repeat(81)])(
    "rejects invalid input %s",
    (word) => expect(() => validateWord(word)).toThrow(),
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
describe("AI boundary", () => {
  const good = {
    valid: true,
    syllables: [
      { text: "ruh", stressed: false },
      { text: "sind", stressed: true },
    ],
    explanation: "To officially cancel a decision.",
    thai: "ยกเลิกการตัดสินใจอย่างเป็นทางการ",
  };
  it("accepts readable stressed respelling and Thai explanation", () =>
    expect(enrichmentSchema.parse(good).syllables).toHaveLength(2));
  it("rejects IPA", () =>
    expect(
      enrichmentSchema.safeParse({
        ...good,
        syllables: [{ text: "rɪˈsɪnd", stressed: true }],
      }).success,
    ).toBe(false));
  it("rejects missing stress", () =>
    expect(
      enrichmentSchema.safeParse({
        ...good,
        syllables: [{ text: "ruh", stressed: false }],
      }).success,
    ).toBe(false));
  it("rejects multiple primary stresses", () =>
    expect(
      enrichmentSchema.safeParse({
        ...good,
        syllables: [
          { text: "ruh", stressed: true },
          { text: "sind", stressed: true },
        ],
      }).success,
    ).toBe(false));
  it("rejects non-Thai translation", () =>
    expect(
      enrichmentSchema.safeParse({ ...good, thai: "cancel officially" })
        .success,
    ).toBe(false));
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
