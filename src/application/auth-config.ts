import "server-only";
import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import type { Provider } from "next-auth/providers";
import { z } from "zod";
import { authProviderOptions } from "./auth-providers";

const googleProfileSchema = z.object({
  sub: z.string().min(1),
  email: z.email().optional(),
  email_verified: z.boolean().optional(),
  hd: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});
const facebookProfileSchema = z.object({
  id: z.string().min(1),
  email: z.email().optional(),
  name: z.string().optional(),
  picture: z.object({ data: z.object({ url: z.string() }) }).optional(),
});
const chatgptProfileSchema = z.object({
  sub: z.string().min(1),
  email: z.email().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
export function authoritativeGoogleEmail(raw: unknown) {
  const parsed = googleProfileSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.email_verified !== true ||
    !parsed.data.email
  )
    return false;
  const domain = normalizeEmail(parsed.data.email).split("@")[1];
  return (
    domain === "gmail.com" ||
    Boolean(parsed.data.hd && domain === parsed.data.hd.toLowerCase())
  );
}
export function createAuthConfig(
  env: Record<string, string | undefined>,
  adapter: Adapter | undefined,
): NextAuthConfig {
  const options = authProviderOptions(env);
  const providers: Provider[] = [];
  if (options.find((option) => option.id === "google")?.enabled)
    providers.push(
      Google({
        clientId: env.AUTH_GOOGLE_ID || env.GOOGLE_CLIENT_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET || env.GOOGLE_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
        checks: ["state", "pkce", "nonce"],
        profile(raw) {
          const profile = googleProfileSchema.parse(raw);
          return {
            id: profile.sub,
            name: profile.name,
            email:
              profile.email && profile.email_verified === true
                ? normalizeEmail(profile.email)
                : null,
            image: profile.picture,
          };
        },
      }),
    );
  if (options.find((option) => option.id === "facebook")?.enabled)
    providers.push(
      Facebook({
        clientId: env.AUTH_FACEBOOK_ID,
        clientSecret: env.AUTH_FACEBOOK_SECRET,
        profile(raw) {
          const profile = facebookProfileSchema.parse(raw);
          return {
            id: profile.id,
            name: profile.name,
            email: profile.email ? normalizeEmail(profile.email) : null,
            image: profile.picture?.data.url,
          };
        },
      }),
    );
  if (options.find((option) => option.id === "chatgpt")?.enabled)
    providers.push({
      id: "chatgpt",
      name: "ChatGPT",
      type: "oidc",
      issuer: "https://auth.openai.com",
      clientId: env.AUTH_CHATGPT_ID,
      clientSecret: env.AUTH_CHATGPT_SECRET,
      authorization: { params: { scope: "openid profile email" } },
      checks: ["state", "pkce", "nonce"],
      client: {
        token_endpoint_auth_method:
          env.AUTH_CHATGPT_TOKEN_AUTH_METHOD || "client_secret_post",
      },
      profile(raw) {
        const profile = chatgptProfileSchema.parse(raw);
        return {
          id: JSON.stringify([env.AUTH_CHATGPT_ID, profile.sub]),
          name: profile.name,
          email:
            profile.email && profile.email_verified === true
              ? normalizeEmail(profile.email)
              : null,
          image: profile.picture,
        };
      },
    });
  return {
    adapter,
    providers,
    secret: env.AUTH_SECRET,
    pages: { signIn: "/", error: "/" },
    session: {
      strategy: "database",
      maxAge: 400 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google") return true;
        if (!adapter?.getUserByAccount || !adapter.getUserByEmail) return false;
        const linked = await adapter.getUserByAccount({
          provider: "google",
          providerAccountId: account.providerAccountId,
        });
        if (linked) return true;
        const parsed = googleProfileSchema.safeParse(profile);
        if (
          !parsed.success ||
          parsed.data.email_verified !== true ||
          !parsed.data.email
        )
          return false;
        const existing = await adapter.getUserByEmail(
          normalizeEmail(parsed.data.email),
        );
        return !existing || authoritativeGoogleEmail(parsed.data);
      },
      session({ session, user }) {
        return {
          expires: new Date(session.expires).toISOString(),
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        };
      },
    },
  };
}
