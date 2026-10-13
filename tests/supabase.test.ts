import { afterEach, expect, it, vi } from "vitest";
import { SupabaseRepository, serviceClient } from "../src/adapters/supabase";
import { dictionaryEntry, vocabulary } from "./fixtures/dictionary";
afterEach(() => vi.unstubAllGlobals());
it("sends the requested word and complete normalized entry to the new RPC", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([vocabulary]), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const repository = new SupabaseRepository(
    serviceClient("https://test.supabase.co", "server-secret"),
    "00000000-0000-4000-8000-000000000001",
  );
  expect(await repository.save("ought", dictionaryEntry)).toEqual(vocabulary);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://test.supabase.co/rest/v1/rpc/save_vocabulary",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    p_user_id: "00000000-0000-4000-8000-000000000001",
    p_word: "ought",
    p_entry: dictionaryEntry,
  });
});
it("identifies a missing migration rather than suggesting a save retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ code: "PGRST202", message: "RPC not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
  );
  const repository = new SupabaseRepository(
    serviceClient("https://test.supabase.co", "server-secret"),
    "00000000-0000-4000-8000-000000000001",
  );
  await expect(repository.save("ought", dictionaryEntry)).rejects.toThrow(
    "latest SQL migration",
  );
});
it("rejects an invalid stored content shape at the repository boundary", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            ...vocabulary,
            content: {
              kind: "dictionary",
              entry: { ...dictionaryEntry, definitions: [] },
            },
          },
        ]),
        { headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  const repository = new SupabaseRepository(
    serviceClient("https://test.supabase.co", "server-secret"),
    "00000000-0000-4000-8000-000000000001",
  );
  await expect(repository.save("ought", dictionaryEntry)).rejects.toThrow();
});

it("scopes list and duplicate reads to the authenticated owner", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response("[]", { headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetcher);
  const owner = "00000000-0000-4000-8000-000000000001";
  const repository = new SupabaseRepository(
    serviceClient("https://test.supabase.co", "server-secret"),
    owner,
  );
  expect(await repository.listToday("2026-10-13")).toEqual([]);
  expect(await repository.hasWord("ought")).toBe(false);
  for (const call of fetcher.mock.calls)
    expect(
      new URL(
        call[0] instanceof Request ? call[0].url : call[0],
      ).searchParams.get("user_id"),
    ).toBe(`eq.${owner}`);
});

it("fetches one filtered History page with a total count", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify([vocabulary]), {
        headers: {
          "Content-Type": "application/json",
          "Content-Range": "40-40/81",
        },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const repository = new SupabaseRepository(
    serviceClient("https://test.supabase.co", "server-secret"),
    "00000000-0000-4000-8000-000000000001",
  );
  expect(
    await repository.listHistoryPage({
      page: 2,
      period: "month",
      value: "2026-10",
      order: "desc",
    }),
  ).toEqual({ entries: [vocabulary], total: 81 });
  const [input, options] = fetcher.mock.calls[0];
  const url = new URL(input instanceof Request ? input.url : input);
  expect(url.searchParams.get("user_id")).toBe(
    "eq.00000000-0000-4000-8000-000000000001",
  );
  expect(url.searchParams.getAll("day")).toEqual([
    "gte.2026-10-01",
    "lte.2026-10-31",
  ]);
  expect(url.searchParams.get("order")).toBe(
    "day.desc,created_at.desc,word.desc,id.desc",
  );
  expect(url.searchParams.get("offset")).toBe("40");
  expect(url.searchParams.get("limit")).toBe("40");
  expect(new Headers(options?.headers).get("Prefer")).toContain("count=exact");
});
