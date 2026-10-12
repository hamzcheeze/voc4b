// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  createAuthConfig,
  authoritativeGoogleEmail,
} from "../src/application/auth-config";
import { authProviderOptions } from "../src/application/auth-providers";

it("accepts authoritative Google identity without preliminary database reads", async () => {
  const getUserByAccount = vi.fn(async () => null);
  const getUserByEmail = vi.fn(async () => null);
  const config = createAuthConfig({}, { getUserByAccount, getUserByEmail });
  const accepted = await config.callbacks?.signIn?.({
    user: { id: "google-subject" },
    account: {
      provider: "google",
      type: "oidc",
      providerAccountId: "google-subject",
    },
    profile: {
      sub: "google-subject",
      email: "alice@gmail.com",
      email_verified: true,
    },
  });
  expect(accepted).toBe(true);
  expect(getUserByAccount).not.toHaveBeenCalled();
  expect(getUserByEmail).not.toHaveBeenCalled();
});

it("accepts the supplied Google environment aliases without exposing credentials", () => {
  const options = authProviderOptions({
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
  });
  expect(options).toEqual([
    { id: "google", name: "Google", enabled: true },
    { id: "facebook", name: "Facebook", enabled: false },
    { id: "chatgpt", name: "ChatGPT", enabled: false },
  ]);
});
it.each(["client_secret_post", "client_secret_basic"])(
  "ChatGPT %s needs a client secret",
  (method) => {
    expect(
      authProviderOptions({
        AUTH_CHATGPT_ID: "issued-client",
        AUTH_CHATGPT_TOKEN_AUTH_METHOD: method,
      }).find((option) => option.id === "chatgpt")?.enabled,
    ).toBe(false);
    expect(
      authProviderOptions({
        AUTH_CHATGPT_ID: "issued-client",
        AUTH_CHATGPT_SECRET: "issued-secret",
        AUTH_CHATGPT_TOKEN_AUTH_METHOD: method,
      }).find((option) => option.id === "chatgpt")?.enabled,
    ).toBe(true);
  },
);
it("ChatGPT public registration needs its issued client ID with PKCE but no secret", async () => {
  const env = {
    AUTH_CHATGPT_ID: "issued-client",
    AUTH_CHATGPT_TOKEN_AUTH_METHOD: "none",
  };
  expect(
    authProviderOptions(env).find((option) => option.id === "chatgpt")?.enabled,
  ).toBe(true);
  const provider = createAuthConfig(env, undefined).providers[0];
  if (
    !provider ||
    typeof provider === "function" ||
    provider.type !== "oidc" ||
    !provider.profile
  )
    throw new Error("ChatGPT provider missing");
  expect(provider.issuer).toBe("https://auth.openai.com");
  expect(provider.checks).toEqual(["state", "pkce", "nonce"]);
  expect(provider.client?.token_endpoint_auth_method).toBe("none");
  expect(provider.allowDangerousEmailAccountLinking).not.toBe(true);
  const profile = await provider.profile(
    { sub: "subject", email: "ALICE@gmail.com", email_verified: true },
    {},
  );
  expect(profile.id).toBe('["issued-client","subject"]');
  expect(profile.email).toBe("alice@gmail.com");
  const unverified = await provider.profile(
    { sub: "subject", email: "ALICE@gmail.com", email_verified: false },
    {},
  );
  expect(unverified.email).toBeNull();
});
it("invalid ChatGPT token auth methods keep its button unavailable", () => {
  expect(
    authProviderOptions({
      AUTH_CHATGPT_ID: "client",
      AUTH_CHATGPT_SECRET: "secret",
      AUTH_CHATGPT_TOKEN_AUTH_METHOD: "unsupported",
    }).find((option) => option.id === "chatgpt")?.enabled,
  ).toBe(false);
});
it.each([
  [{ sub: "sub", email: "a@gmail.com", email_verified: true }, true],
  [
    {
      sub: "sub",
      email: "a@example.com",
      email_verified: true,
      hd: "example.com",
    },
    true,
  ],
  [{ sub: "sub", email: "a@example.com", email_verified: true }, false],
  [
    {
      sub: "sub",
      email: "a@example.com",
      email_verified: true,
      hd: "elsewhere.com",
    },
    false,
  ],
  [{ sub: "sub", email: "a@gmail.com", email_verified: false }, false],
])("Google authoritative identity policy %j", (profile, expected) => {
  expect(authoritativeGoogleEmail(profile)).toBe(expected);
});
