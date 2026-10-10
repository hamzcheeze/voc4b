import { it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/words/route";
afterEach(() => vi.unstubAllEnvs());
it("production missing configuration is explicit 503", async () => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  expect(
    (await GET(new NextRequest("http://localhost:3000/api/words"))).status,
  ).toBe(503);
});
it("requires bearer authentication before dictionary work", async () => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public");
  expect(
    (
      await POST(
        new NextRequest("http://localhost:3000/api/words", {
          method: "POST",
          body: '{"word":"rescind"}',
        }),
      )
    ).status,
  ).toBe(401);
});
it("rejects cross origin submission", async () => {
  expect(
    (
      await POST(
        new NextRequest("http://localhost:3000/api/words", {
          method: "POST",
          headers: { origin: "https://evil.example" },
          body: '{"word":"rescind"}',
        }),
      )
    ).status,
  ).toBe(403);
});
it("accepts the browser host when Next binds to an internal dev address", async () => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public");
  const response = await POST(
    new NextRequest("http://0.0.0.0:3000/api/words", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
      body: '{"word":"rescind"}',
    }),
  );
  expect(response.status).toBe(401);
});
it("rejects a foreign origin even with the legitimate browser host", async () => {
  const response = await POST(
    new NextRequest("http://0.0.0.0:3000/api/words", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:3000" },
      body: '{"word":"rescind"}',
    }),
  );
  expect(response.status).toBe(403);
});
it("rejects oversized payload early", async () => {
  expect(
    (
      await POST(
        new NextRequest("http://localhost:3000/api/words", {
          method: "POST",
          headers: { "content-length": "10000" },
          body: "x",
        }),
      )
    ).status,
  ).toBe(413);
});
