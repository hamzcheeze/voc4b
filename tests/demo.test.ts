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
