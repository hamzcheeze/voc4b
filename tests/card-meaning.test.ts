import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "../src/app/api/words/route";
import { demoStore } from "../src/adapters/demo";
import { thaiMeaningSchema, vocabularySchema } from "../src/domain/vocabulary";
import { vocabulary } from "./fixtures/dictionary";
const owner = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000003";
const authentication = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("../src/auth", () => ({ auth: authentication.auth }));
beforeEach(() => {
  localStorage.clear();
  authentication.auth.mockResolvedValue({ user: { id: owner } });
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
  vi.stubEnv("AUTH_SECRET", "secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function request(body: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/words", {
    method: "PATCH",
    headers: { origin },
    body: JSON.stringify(body),
  });
}
it("validates annotation metadata while keeping dictionary entries unchanged", () => {
  expect(thaiMeaningSchema.parse("  ควร  ")).toBe("ควร");
  for (const value of ["", " ", "a".repeat(601), "\nควร", "bad\u0000text"])
    expect(thaiMeaningSchema.safeParse(value).success).toBe(false);
  expect(
    vocabularySchema.parse({
      ...vocabulary,
      content: { ...vocabulary.content, thaiMeaning: "ควร" },
    }).content.thaiMeaning,
  ).toBe("ควร");
});
it("persists and edits the exact demo card without using quota or changing other data", async () => {
  const first = await demoStore.add("rescind");
  await demoStore.add("serene");
  const before = demoStore.list();
  const updated = await demoStore.updateMeaning(first.id, "  ยกเลิก  ");
  expect(updated).toEqual({
    ...first,
    content: { ...first.content, thaiMeaning: "ยกเลิก" },
  });
  expect(demoStore.list()).toEqual(
    before.map((row) => (row.id === first.id ? updated : row)),
  );
  await demoStore.updateMeaning(first.id, "ถอน");
  expect(
    demoStore.list().find((row) => row.id === first.id)?.content.thaiMeaning,
  ).toBe("ถอน");
  await expect(demoStore.updateMeaning("missing", "ควร")).rejects.toThrow(
    /no longer/,
  );
});
it("PATCH makes one owner-scoped RPC and returns the updated card", async () => {
  const entry = {
    ...vocabulary,
    id,
    content: { ...vocabulary.content, thaiMeaning: "ควร" },
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify([entry]), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const response = await PATCH(request({ id, thaiMeaning: "  ควร  " }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ entry });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://test.supabase.co/rest/v1/rpc/update_vocabulary_meaning",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    p_user_id: owner,
    p_id: id,
    p_meaning: "ควร",
  });
});
it("PATCH rejects foreign origins, bad input and missing session without database calls", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    (await PATCH(request({ id, thaiMeaning: "ควร" }, "https://evil.test")))
      .status,
  ).toBe(403);
  for (const body of [
    { id: "bad", thaiMeaning: "ควร" },
    { id, thaiMeaning: "" },
    { id, thaiMeaning: "ควร", userId: owner },
  ])
    expect((await PATCH(request(body))).status).toBe(400);
  authentication.auth.mockResolvedValue(null);
  expect((await PATCH(request({ id, thaiMeaning: "ควร" }))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it("PATCH handles a vanished card and a missing migration", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("[]", { headers: { "Content-Type": "application/json" } }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "PGRST202", message: "RPC not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  expect((await PATCH(request({ id, thaiMeaning: "ควร" }))).status).toBe(404);
  expect(
    await (await PATCH(request({ id, thaiMeaning: "ควร" }))).json(),
  ).toEqual({ error: expect.stringContaining("database needs an update") });
});
