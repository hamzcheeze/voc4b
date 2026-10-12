import { it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, POST } from "../src/app/api/words/route";
const authentication = vi.hoisted(() => ({ auth: vi.fn(async () => null) }));
vi.mock("../src/auth", () => ({ auth: authentication.auth }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("production missing configuration is explicit 503", async () => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  expect((await GET()).status).toBe(503);
});
it("requires a server session before dictionary work", async () => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  vi.stubEnv("AUTH_SECRET", "auth-secret");
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
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  vi.stubEnv("AUTH_SECRET", "auth-secret");
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
it("requires a valid word ID and authentication for deletion", async () => {
  const invalid = await DELETE(
    new NextRequest("http://localhost:3000/api/words?id=not-an-id", {
      method: "DELETE",
    }),
  );
  expect(invalid.status).toBe(400);
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  vi.stubEnv("AUTH_SECRET", "auth-secret");
  const unauthenticated = await DELETE(
    new NextRequest(
      "http://localhost:3000/api/words?id=00000000-0000-4000-8000-000000000001",
      { method: "DELETE" },
    ),
  );
  expect(unauthenticated.status).toBe(401);
});
it("rejects deletion from another website", async () => {
  const response = await DELETE(
    new NextRequest(
      "http://localhost:3000/api/words?id=00000000-0000-4000-8000-000000000001",
      { method: "DELETE", headers: { origin: "https://evil.example" } },
    ),
  );
  expect(response.status).toBe(403);
});

it("requires an Auth.js session independently of caller identity", async () => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  vi.stubEnv("AUTH_SECRET", "auth-secret");
  expect((await GET()).status).toBe(401);
});
