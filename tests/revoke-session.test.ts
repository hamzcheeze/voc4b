// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/auth/revoke/route";

const adapter = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getSessionAndUser: vi.fn(),
}));
vi.mock("@auth/supabase-adapter", () => ({
  SupabaseAdapter: () => adapter,
}));

beforeEach(() => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.example.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret");
  adapter.deleteSession.mockReset().mockResolvedValue(undefined);
  adapter.getSessionAndUser.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

function request(
  cookie = "authjs.session-token=current-session",
  origin: string | null = "http://localhost:3000",
) {
  return new NextRequest("http://localhost:3000/api/auth/revoke", {
    method: "POST",
    headers: { cookie, ...(origin ? { origin } : {}) },
  });
}

it("revokes only the incoming cookie and verifies revocation before reporting success", async () => {
  let completeDelete: (() => void) | undefined;
  adapter.deleteSession.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        completeDelete = resolve;
      }),
  );
  const pending = POST(request());
  expect(adapter.deleteSession).toHaveBeenCalledWith("current-session");
  expect(adapter.getSessionAndUser).not.toHaveBeenCalled();
  completeDelete?.();
  const response = await pending;
  expect(adapter.getSessionAndUser).toHaveBeenCalledExactlyOnceWith(
    "current-session",
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(await response.text()).toBe("");
});

it("supports the secure production cookie", async () => {
  const response = await POST(
    request("__Secure-authjs.session-token=production-session"),
  );
  expect(response.status).toBe(204);
  expect(adapter.deleteSession).toHaveBeenCalledExactlyOnceWith(
    "production-session",
  );
});

it("revokes both incoming session cookies before returning success", async () => {
  expect(
    (
      await POST(
        request(
          "authjs.session-token=local-session; __Secure-authjs.session-token=secure-session",
        ),
      )
    ).status,
  ).toBe(204);
  expect(adapter.deleteSession.mock.calls).toEqual([
    ["local-session"],
    ["secure-session"],
  ]);
  expect(adapter.getSessionAndUser.mock.calls).toEqual([
    ["local-session"],
    ["secure-session"],
  ]);
});

it("ignores a token supplied in a body or query parameter", async () => {
  const incoming = new NextRequest(
    "http://localhost:3000/api/auth/revoke?sessionToken=another-user",
    {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "authjs.session-token=current-session",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionToken: "another-user" }),
    },
  );
  expect((await POST(incoming)).status).toBe(204);
  expect(adapter.deleteSession).toHaveBeenCalledExactlyOnceWith(
    "current-session",
  );
});

it.each([null, "null", "https://attacker.example.test"])(
  "rejects untrusted Origin %s before touching sessions",
  async (origin) => {
    expect((await POST(request(undefined, origin))).status).toBe(403);
    expect(adapter.deleteSession).not.toHaveBeenCalled();
  },
);

it("accepts the browser host when Next binds to 0.0.0.0", async () => {
  const incoming = new NextRequest("http://0.0.0.0:3000/api/auth/revoke", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: "authjs.session-token=current-session",
    },
  });
  expect((await POST(incoming)).status).toBe(204);
});

it("allows retry when the session is already absent", async () => {
  expect((await POST(request())).status).toBe(204);
  expect((await POST(request(""))).status).toBe(204);
  expect(adapter.deleteSession).toHaveBeenCalledTimes(1);
});

it("does not report success or clear cookies when deleting the database session fails", async () => {
  adapter.deleteSession.mockRejectedValue(
    new Error("current-session test-secret database failure"),
  );
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(await response.json()).toEqual({
    error: "Could not sign out. Please try again.",
  });
  expect(adapter.getSessionAndUser).not.toHaveBeenCalled();
});

it("rejects an unconfirmed deletion", async () => {
  adapter.getSessionAndUser.mockResolvedValue({ session: {}, user: {} });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(response.headers.has("set-cookie")).toBe(false);
});

it("keeps logout retryable when the verification read fails", async () => {
  adapter.getSessionAndUser.mockRejectedValue(
    new Error("database unavailable"),
  );
  expect((await POST(request())).status).toBe(503);
  adapter.getSessionAndUser.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(204);
});
