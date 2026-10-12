// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { Auth, customFetch } from "@auth/core";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthConfig } from "next-auth";
import { generateKeyPair, SignJWT } from "jose";
import { z } from "zod";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAuthConfig } from "../src/application/auth-config";

const imported = "00000000-0000-4000-8000-000000000001";
const userSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  emailVerified: z.coerce.date().nullable(),
  image: z.string().nullable(),
});
const sessionSchema = z.object({
  sessionToken: z.string(),
  userId: z.string(),
  expires: z.coerce.date(),
});
let db: PGlite;
let adapter: Adapter;
let config: NextAuthConfig;
let profile = {
  sub: "google-subject",
  email: "alice@gmail.com",
  email_verified: true,
  hd: "",
};
let nonce = "";
let cookieJar: Map<string, string>;
let failures: unknown[];
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create table users(id uuid primary key, name text, email text unique, "emailVerified" timestamptz, image text);
    create table accounts(provider text, "providerAccountId" text, "userId" uuid, unique(provider,"providerAccountId"));
    create table sessions("sessionToken" text primary key, "userId" uuid, expires timestamptz);
    insert into users(id,email) values('${imported}','alice@gmail.com');`);
  profile = {
    sub: "google-subject",
    email: "alice@gmail.com",
    email_verified: true,
    hd: "",
  };
  cookieJar = new Map();
  failures = [];
  async function getUser(id: string) {
    const row = (await db.query("select * from users where id=$1", [id]))
      .rows[0];
    return row ? userSchema.parse(row) : null;
  }
  adapter = {
    createUser: async (user) => {
      const row = (
        await db.query(
          'insert into users(id,name,email,"emailVerified",image) values($1,$2,$3,$4,$5) returning *',
          [
            user.id || randomUUID(),
            user.name || null,
            user.email,
            user.emailVerified,
            user.image || null,
          ],
        )
      ).rows[0];
      return userSchema.parse(row);
    },
    getUser,
    getUserByEmail: async (email) => {
      const row = (
        await db.query("select * from users where email=$1", [email])
      ).rows[0];
      return row ? userSchema.parse(row) : null;
    },
    getUserByAccount: async (account) => {
      const row = (
        await db.query(
          'select users.* from users join accounts on users.id=accounts."userId" where provider=$1 and "providerAccountId"=$2',
          [account.provider, account.providerAccountId],
        )
      ).rows[0];
      return row ? userSchema.parse(row) : null;
    },
    updateUser: async (user) => {
      const current = await getUser(user.id);
      if (!current) throw new Error("Missing user");
      const merged = { ...current, ...user };
      const row = (
        await db.query(
          'update users set name=$2,email=$3,"emailVerified"=$4,image=$5 where id=$1 returning *',
          [
            merged.id,
            merged.name,
            merged.email,
            merged.emailVerified,
            merged.image,
          ],
        )
      ).rows[0];
      return userSchema.parse(row);
    },
    linkAccount: async (account) => {
      await db.query(
        'insert into accounts(provider,"providerAccountId","userId") values($1,$2,$3)',
        [account.provider, account.providerAccountId, account.userId],
      );
    },
    createSession: async (session) => {
      const row = (
        await db.query(
          'insert into sessions("sessionToken","userId",expires) values($1,$2,$3) returning *',
          [session.sessionToken, session.userId, session.expires],
        )
      ).rows[0];
      return sessionSchema.parse(row);
    },
    getSessionAndUser: async (token) => {
      const row = (
        await db.query('select * from sessions where "sessionToken"=$1', [
          token,
        ])
      ).rows[0];
      if (!row) return null;
      const session = sessionSchema.parse(row);
      const user = await getUser(session.userId);
      return user ? { session, user } : null;
    },
    updateSession: async (session) => {
      const row = (
        await db.query(
          'update sessions set expires=$2 where "sessionToken"=$1 returning *',
          [session.sessionToken, session.expires],
        )
      ).rows[0];
      return row ? sessionSchema.parse(row) : null;
    },
    deleteSession: async (token) => {
      await db.query('delete from sessions where "sessionToken"=$1', [token]);
    },
  };
  const { privateKey } = await generateKeyPair("ES256");
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes(".well-known"))
      return Response.json({
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/authorize",
        token_endpoint: "https://accounts.google.com/token",
        userinfo_endpoint: "https://accounts.google.com/userinfo",
        jwks_uri: "https://accounts.google.com/jwks",
        response_types_supported: ["code"],
        id_token_signing_alg_values_supported: ["ES256"],
        code_challenge_methods_supported: ["S256"],
      });
    if (url.endsWith("/token")) {
      const idToken = await new SignJWT({ ...profile, nonce })
        .setProtectedHeader({ alg: "ES256" })
        .setIssuer("https://accounts.google.com")
        .setAudience("test-google-id")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return Response.json({
        access_token: "fake-access-token",
        token_type: "Bearer",
        id_token: idToken,
      });
    }
    throw new Error(`Unexpected provider request ${url}`);
  };
  config = createAuthConfig(
    {
      AUTH_GOOGLE_ID: "test-google-id",
      AUTH_GOOGLE_SECRET: "test-secret",
      AUTH_SECRET: "test-auth-secret-at-least-32-characters",
    },
    adapter,
  );
  const google = config.providers[0];
  if (!google || typeof google === "function" || google.type !== "oidc")
    throw new Error("Google provider missing");
  config = {
    ...config,
    basePath: "/api/auth",
    trustHost: true,
    providers: [
      { ...google, options: { ...google.options, [customFetch]: fakeFetch } },
    ],
    logger: { error: (error) => failures.push(error), warn() {}, debug() {} },
  };
}, 30000);
afterEach(async () => {
  await db.close();
});
async function request(path: string, body?: URLSearchParams) {
  const response = await Auth(
    new Request(`http://localhost:3000/api/auth/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        cookie: [...cookieJar]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body,
    }),
    config,
  );
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (value) cookieJar.set(name, value);
    else cookieJar.delete(name);
  }
  return response;
}
async function login(provider = "google") {
  const csrf = z
    .object({ csrfToken: z.string() })
    .parse(await (await request("csrf")).json());
  const signIn = await request(
    `signin/${provider}`,
    new URLSearchParams({
      csrfToken: csrf.csrfToken,
      callbackUrl: "http://localhost:3000/",
    }),
  );
  const url = new URL(z.string().parse(signIn.headers.get("location")));
  nonce = url.searchParams.get("nonce") || "";
  const result = await request(
    `callback/${provider}?code=fake-code&state=${url.searchParams.get("state")}`,
  );
  return result;
}
it("first Google signup and repeat signin create one identity, then logout revokes replay", async () => {
  profile.email = "new-user@gmail.com";
  expect((await login()).headers.get("location")).toBe(
    "http://localhost:3000/",
  );
  const first = z
    .object({
      user: z.object({ id: z.uuid(), email: z.email() }),
      expires: z.string(),
    })
    .parse(await (await request("session")).json());
  expect(first.user.email).toBe("new-user@gmail.com");
  const publicSession = await (await request("session")).json();
  expect(Object.keys(publicSession).sort()).toEqual(["expires", "user"]);
  expect(Object.keys(publicSession.user).sort()).toEqual([
    "email",
    "id",
    "image",
    "name",
  ]);
  expect(first.user.id).not.toBe(imported);
  const token = cookieJar.get("authjs.session-token");
  expect(token).toBeTruthy();
  cookieJar.clear();
  expect((await login()).headers.get("location")).toBe(
    "http://localhost:3000/",
  );
  const repeated = z
    .object({ user: z.object({ id: z.uuid() }) })
    .parse(await (await request("session")).json());
  expect(repeated.user.id).toBe(first.user.id);
  expect((await db.query("select * from accounts")).rows).toHaveLength(1);
  expect((await db.query("select * from users")).rows).toHaveLength(2);
  const replay = cookieJar.get("authjs.session-token");
  const csrf = z
    .object({ csrfToken: z.string() })
    .parse(await (await request("csrf")).json());
  await request("signout", new URLSearchParams({ csrfToken: csrf.csrfToken }));
  expect(cookieJar.has("authjs.session-token")).toBe(false);
  if (!replay) throw new Error("Session cookie missing");
  cookieJar.set("authjs.session-token", replay);
  expect(await (await request("session")).json()).toBeNull();
  expect(await adapter.getSessionAndUser?.(replay)).toBeNull();
  expect(failures).toEqual([]);
});
it("a signed authoritative Google identity recovers the literal imported UUID", async () => {
  profile.email = "Alice@Gmail.com";
  expect((await login()).headers.get("location")).toBe(
    "http://localhost:3000/",
  );
  expect(
    z
      .object({ user: z.object({ id: z.uuid() }) })
      .parse(await (await request("session")).json()).user.id,
  ).toBe(imported);
  expect((await db.query("select * from users")).rows).toHaveLength(1);
  expect((await db.query('select "userId" from accounts')).rows).toEqual([
    { userId: imported },
  ]);
});
it.each([
  { email: "alice@example.com", email_verified: true, hd: "" },
  { email: "alice@example.com", email_verified: true, hd: "other.com" },
  { email: "alice@example.com", email_verified: false, hd: "example.com" },
])("rejects unsafe imported identity claim %j", async (claims) => {
  await db.exec("update users set email='alice@example.com'");
  profile = { ...profile, ...claims };
  expect((await login()).headers.get("location")).toContain(
    "error=AccessDenied",
  );
  expect((await db.query("select * from accounts")).rows).toEqual([]);
  expect((await db.query("select * from sessions")).rows).toEqual([]);
});
it("permits an already linked subject without email-based identity reassignment", async () => {
  expect((await login()).headers.get("location")).toBe(
    "http://localhost:3000/",
  );
  cookieJar.clear();
  profile = { ...profile, email: "changed@example.com", email_verified: false };
  expect((await login()).headers.get("location")).toBe(
    "http://localhost:3000/",
  );
  expect(
    z
      .object({ user: z.object({ id: z.uuid() }) })
      .parse(await (await request("session")).json()).user.id,
  ).toBe(imported);
});
it("renews an active database session and returns a renewed persistent cookie", async () => {
  await login();
  const token = cookieJar.get("authjs.session-token");
  await db.query(
    "update sessions set expires=now()+interval '1 day' where \"sessionToken\"=$1",
    [token],
  );
  const renewed = await request("session");
  const data = z
    .object({ expires: z.string() })
    .parse(await (await request("session")).json());
  expect(new Date(data.expires).getTime() - Date.now()).toBeGreaterThan(
    399 * 86400000,
  );
  expect(
    renewed.headers
      .getSetCookie()
      .some(
        (cookie) =>
          cookie.startsWith("authjs.session-token=") &&
          cookie.includes("Expires="),
      ),
  ).toBe(true);
  const stored = await adapter.getSessionAndUser?.(z.string().parse(token));
  expect(stored?.session.expires.getTime()).toBeGreaterThan(
    Date.now() + 399 * 86400000,
  );
});

it("Facebook cannot take an imported account by matching an email", async () => {
  const facebook = createAuthConfig(
    {
      AUTH_FACEBOOK_ID: "facebook-id",
      AUTH_FACEBOOK_SECRET: "facebook-secret",
    },
    adapter,
  ).providers[0];
  if (!facebook || typeof facebook === "function" || facebook.type !== "oauth")
    throw new Error("Facebook missing");
  const fakeFetch: typeof fetch = async () =>
    Response.json({
      access_token: "fake-facebook-token",
      token_type: "Bearer",
    });
  config.providers.push({
    ...facebook,
    options: {
      ...facebook.options,
      checks: ["state"],
      authorization: "https://facebook.example.test/authorize",
      token: "https://facebook.example.test/token",
      userinfo: {
        url: "https://facebook.example.test/userinfo",
        request: async () => ({
          id: "facebook-subject",
          email: "Alice@Gmail.com",
          name: "Alice",
        }),
      },
      [customFetch]: fakeFetch,
    },
  });
  expect((await login("facebook")).headers.get("location")).toContain(
    "error=OAuthAccountNotLinked",
  );
  expect((await db.query("select * from accounts")).rows).toEqual([]);
  expect((await db.query("select * from users")).rows).toHaveLength(1);
});
it("signed Workspace identity can recover the imported owner only for its matching domain", async () => {
  await db.exec("update users set email='alice@example.com'");
  profile = { ...profile, email: "alice@example.com", hd: "example.com" };
  expect((await login()).headers.get("location")).toBe(
    "http://localhost:3000/",
  );
  const session = z
    .object({ user: z.object({ id: z.uuid() }) })
    .parse(await (await request("session")).json());
  expect(session.user.id).toBe(imported);
});
it("ChatGPT cannot take an imported account by matching a verified email", async () => {
  const chatgpt = createAuthConfig(
    {
      AUTH_CHATGPT_ID: "issued-chatgpt-id",
      AUTH_CHATGPT_SECRET: "issued-chatgpt-secret",
    },
    adapter,
  ).providers[0];
  if (!chatgpt || typeof chatgpt === "function" || chatgpt.type !== "oidc")
    throw new Error("ChatGPT missing");
  const { privateKey } = await generateKeyPair("ES256");
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes(".well-known"))
      return Response.json({
        issuer: "https://auth.openai.com",
        authorization_endpoint: "https://auth.openai.com/authorize",
        token_endpoint: "https://auth.openai.com/token",
        userinfo_endpoint: "https://auth.openai.com/userinfo",
        jwks_uri: "https://auth.openai.com/jwks",
        response_types_supported: ["code"],
        id_token_signing_alg_values_supported: ["ES256"],
        code_challenge_methods_supported: ["S256"],
      });
    if (url.endsWith("/token")) {
      const idToken = await new SignJWT({
        sub: "chatgpt-subject",
        email: "alice@gmail.com",
        email_verified: true,
        nonce,
      })
        .setProtectedHeader({ alg: "ES256" })
        .setIssuer("https://auth.openai.com")
        .setAudience("issued-chatgpt-id")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return Response.json({
        access_token: "fake-chatgpt-token",
        token_type: "Bearer",
        id_token: idToken,
      });
    }
    throw new Error(`Unexpected ChatGPT request ${url}`);
  };
  config.providers.push({ ...chatgpt, options: { [customFetch]: fakeFetch } });
  expect((await login("chatgpt")).headers.get("location")).toContain(
    "error=OAuthAccountNotLinked",
  );
  expect((await db.query("select * from accounts")).rows).toEqual([]);
  expect((await db.query("select * from users")).rows).toHaveLength(1);
});
it("rejects an OAuth callback with a mismatched state before creating identity data", async () => {
  const csrf = z
    .object({ csrfToken: z.string() })
    .parse(await (await request("csrf")).json());
  await request(
    "signin/google",
    new URLSearchParams({ csrfToken: csrf.csrfToken }),
  );
  const callback = await request(
    "callback/google?code=fake-code&state=forged-state",
  );
  expect(callback.headers.get("location")).toContain("error=Configuration");
  expect((await db.query("select * from accounts")).rows).toEqual([]);
  expect((await db.query("select * from sessions")).rows).toEqual([]);
});
