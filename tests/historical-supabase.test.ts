import { afterEach, expect, it, vi } from "vitest";
import { SupabaseRepository, serviceClient } from "../src/adapters/supabase";
import { historicalDaySchema } from "../src/application/import-historical-word";
import { dictionaryEntry, vocabulary } from "./fixtures/dictionary";

const userId = "00000000-0000-4000-8000-000000000001";
const day = historicalDaySchema.parse("2023-06-01");
function repository() {
  return new SupabaseRepository(
    serviceClient("https://test.supabase.co", "server-secret"),
    userId,
  );
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
afterEach(() => vi.unstubAllGlobals());
it("allocates slot two and a later timestamp for the second source word", async () => {
  const saved = { ...vocabulary, day, created_at: "2023-05-31T17:00:01.000Z" };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([{ slot: 1 }]))
    .mockResolvedValueOnce(json(saved));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await repository().saveHistorical("ought", day, dictionaryEntry),
  ).toEqual({ entry: saved, skipped: false });
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
    slot: 2,
    created_at: "2023-05-31T17:00:01.000Z",
  });
  const query = new URL(String(fetcher.mock.calls[0][0]));
  expect(query.searchParams.get("user_id")).toBe(`eq.${userId}`);
  expect(query.searchParams.get("day")).toBe("eq.2023-06-01");
});
it("fills a free first slot rather than deriving a conflicting slot from count", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([{ slot: 2 }]))
    .mockResolvedValueOnce(json({ ...vocabulary, day }));
  vi.stubGlobal("fetch", fetcher);
  await repository().saveHistorical("ought", day, dictionaryEntry);
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
    slot: 1,
  });
});
it("handles a concurrent global duplicate without updating its original date", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(
      json({ code: "P0001", message: "duplicate_word" }, 400),
    )
    .mockResolvedValueOnce(json([vocabulary]));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await repository().saveHistorical("ought", day, dictionaryEntry),
  ).toEqual({ entry: vocabulary, skipped: true });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("rechecks available slots after a unique-slot race", async () => {
  const saved = { ...vocabulary, day };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json({ code: "23505", message: "unique slot" }, 409))
    .mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json([{ slot: 1 }]))
    .mockResolvedValueOnce(json(saved));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await repository().saveHistorical("ought", day, dictionaryEntry),
  ).toEqual({ entry: saved, skipped: false });
  expect(JSON.parse(String(fetcher.mock.calls[4][1]?.body))).toMatchObject({
    slot: 2,
  });
});
