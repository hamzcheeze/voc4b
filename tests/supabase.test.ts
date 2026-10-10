import { afterEach, expect, it, vi } from "vitest";
import { SupabaseRepository, userClient } from "../src/adapters/supabase";
import { dictionaryEntry, vocabulary } from "./fixtures/dictionary";
afterEach(() => vi.unstubAllGlobals());
it("sends the requested word and complete normalized entry to the new RPC", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify([vocabulary]), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const repository = new SupabaseRepository(
    userClient("https://test.supabase.co", "public", "user-token"),
  );
  expect(await repository.save("ought", dictionaryEntry)).toEqual(vocabulary);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://test.supabase.co/rest/v1/rpc/save_vocabulary",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
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
    userClient("https://test.supabase.co", "public", "user-token"),
  );
  await expect(repository.save("ought", dictionaryEntry)).rejects.toThrow(
    "002_dictionary.sql",
  );
});
it("rejects an invalid stored content shape at the repository boundary", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
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
    userClient("https://test.supabase.co", "public", "user-token"),
  );
  await expect(repository.save("ought", dictionaryEntry)).rejects.toThrow();
});
