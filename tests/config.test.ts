import { it, expect } from "vitest";
import { appMode } from "../src/application/config";
it("fresh clone development is explicitly demo", () =>
  expect(appMode({ NODE_ENV: "development" })).toBe("demo"));
it("missing production config is blocked, never silently demo", () =>
  expect(appMode({ NODE_ENV: "production" })).toBe("unconfigured"));
it("allows intentional demo deployment", () =>
  expect(appMode({ NODE_ENV: "production", APP_MODE: "demo" })).toBe("demo"));
it("production needs only Supabase keys", () =>
  expect(
    appMode({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public",
    }),
  ).toBe("live"));
it("partial local configuration is blocked rather than disguised as demo", () =>
  expect(
    appMode({
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    }),
  ).toBe("unconfigured"));
it("accepts the current Supabase publishable-key environment name", () =>
  expect(
    appMode({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public",
    }),
  ).toBe("live"));
