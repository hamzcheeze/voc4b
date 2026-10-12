import { it, expect, beforeEach } from "vitest";
import { demoStore } from "../src/adapters/demo";
import { dayKey } from "../src/domain/vocabulary";
beforeEach(() => localStorage.clear());
it("starts with history samples and zero words today", () => {
  const rows = demoStore.list();
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.filter((x) => x.day === dayKey())).toHaveLength(0);
});
it("persists two demo words and enforces cap", async () => {
  await demoStore.add("rescind");
  await demoStore.add("serene");
  await expect(demoStore.add("thrive")).rejects.toThrow();
  expect(demoStore.list().filter((x) => x.day === dayKey())).toHaveLength(2);
});
it("unsupported demo word does not use a slot", async () => {
  await expect(demoStore.add("gibberish")).rejects.toThrow(/Demo/);
  expect(demoStore.list().filter((x) => x.day === dayKey())).toHaveLength(0);
});
it("rejects duplicate demo word without consuming slot", async () => {
  await demoStore.add("rescind");
  await expect(demoStore.add("Rescind")).rejects.toThrow();
  expect(demoStore.list().filter((x) => x.day === dayKey())).toHaveLength(1);
});
it("rejects a word from the history samples without consuming a slot", async () => {
  await expect(demoStore.add("Deliberate")).rejects.toThrow(
    "already in your library",
  );
  expect(demoStore.list().filter((x) => x.day === dayKey())).toHaveLength(0);
});
it("removes one of today's words and accepts a different replacement", async () => {
  const first = await demoStore.add("rescind");
  await demoStore.add("serene");
  await demoStore.removeToday(first.id);
  await demoStore.add("lucid");
  expect(
    demoStore
      .list()
      .filter((row) => row.day === dayKey())
      .map((row) => row.word),
  ).toEqual(["serene", "lucid"]);
  await expect(demoStore.removeToday(first.id)).rejects.toThrow(
    "no longer in today's list",
  );
});
