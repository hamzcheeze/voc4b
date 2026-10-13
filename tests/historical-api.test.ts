import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
import { NextRequest } from "next/server";
import { POST, PUT } from "../src/app/api/words/route";
import { CambridgeDictionary } from "../src/adapters/dictionary";
import { dayKey } from "../src/domain/vocabulary";
import { dictionaryEntry, vocabulary } from "./fixtures/dictionary";

const authentication = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<Session | null>>(),
}));
vi.mock("../src/auth", () => ({ auth: authentication.auth }));
const userId = "00000000-0000-4000-8000-000000000001";
const historicalRow = {
  ...vocabulary,
  day: "2023-06-01",
  created_at: "2023-05-31T17:00:00.000Z",
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/words", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  vi.stubEnv("AUTH_SECRET", "auth-secret");
  vi.stubEnv("HISTORY_IMPORT_USER_ID", userId);
  authentication.auth.mockResolvedValue({ user: { id: userId }, expires: "" });
  vi.spyOn(CambridgeDictionary.prototype, "lookup").mockResolvedValue(
    dictionaryEntry,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it.each([undefined, "00000000-0000-4000-8000-000000000002"])(
  "denies date backfill without the exact configured owner (%s)",
  async (allowedUser) => {
    vi.stubEnv("HISTORY_IMPORT_USER_ID", allowedUser);
    const response = await POST(request({ word: "ought", day: "2023-06-01" }));
    expect(response.status).toBe(403);
    expect(CambridgeDictionary.prototype.lookup).not.toHaveBeenCalled();
  },
);
it.each(["2023-02-29", "2023-06-31", "2023-6-01", "not-a-day", "2999-01-01"])(
  "rejects invalid or future historical dates (%s)",
  async (day) => {
    const response = await POST(request({ word: "ought", day }));
    expect(response.status).toBe(400);
    expect(CambridgeDictionary.prototype.lookup).not.toHaveBeenCalled();
  },
);
it("rejects today using the Bangkok calendar", async () => {
  const response = await POST(request({ word: "ought", day: dayKey() }));
  expect(response.status).toBe(400);
  expect(CambridgeDictionary.prototype.lookup).not.toHaveBeenCalled();
});
it("saves the source date, owner and Cambridge content instead of today's date", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json(historicalRow));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({ word: " OUGHT ", day: "2023-06-01" }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    entry: historicalRow,
    skipped: false,
  });
  expect(CambridgeDictionary.prototype.lookup).toHaveBeenCalledWith("ought");
  expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
    user_id: userId,
    word: "ought",
    day: "2023-06-01",
    slot: 1,
    created_at: "2023-05-31T17:00:00.000Z",
    content: { kind: "dictionary", entry: dictionaryEntry },
  });
});
it.each(["rocket science", "cliché"])(
  "imports the historical dictionary term %s",
  async (word) => {
    const row = { ...historicalRow, word };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json(row));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({ word, day: "2023-06-01" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ entry: row, skipped: false });
    expect(CambridgeDictionary.prototype.lookup).toHaveBeenCalledWith(word);
  },
);
it.each(["rocket science", "cliché", "คำไทย"])(
  "rejects %s from daily add and warmup",
  async (word) => {
    expect((await POST(request({ word }))).status).toBe(422);
    expect((await PUT(request({ word }))).status).toBe(422);
    expect(CambridgeDictionary.prototype.lookup).not.toHaveBeenCalled();
  },
);
it("rejects Thai historical input before fetching", async () => {
  const response = await POST(request({ word: "คำไทย", day: "2023-06-01" }));
  expect(response.status).toBe(422);
  expect(CambridgeDictionary.prototype.lookup).not.toHaveBeenCalled();
});
it("returns an existing word unchanged without lookup or insert", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([vocabulary]));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({ word: "OUGHT", day: "2023-06-01" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ entry: vocabulary, skipped: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(CambridgeDictionary.prototype.lookup).not.toHaveBeenCalled();
});
it("refuses a third historical word even after lookup", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json([{ slot: 1 }, { slot: 2 }]));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({ word: "ought", day: "2023-06-01" }));
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: "This historical date already has two words.",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("continues using the normal save RPC when the date is omitted", async () => {
  vi.stubEnv("HISTORY_IMPORT_USER_ID", undefined);
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname.endsWith("vocabulary_today_count")) return json(0);
    if (url.pathname.endsWith("save_vocabulary")) return json([vocabulary]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({ word: "ought" }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ entry: vocabulary });
  const save = fetcher.mock.calls.find(([input]) =>
    String(input).endsWith("/rpc/save_vocabulary"),
  );
  expect(JSON.parse(String(save?.[1]?.body))).toEqual({
    p_user_id: userId,
    p_word: "ought",
    p_entry: dictionaryEntry,
  });
});
