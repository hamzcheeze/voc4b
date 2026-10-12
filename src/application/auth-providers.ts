export type AuthProviderId = "google" | "facebook" | "chatgpt";
export interface AuthProviderOption {
  id: AuthProviderId;
  name: string;
  enabled: boolean;
}
export function authProviderOptions(
  env: Record<string, string | undefined>,
): AuthProviderOption[] {
  const tokenMethod =
    env.AUTH_CHATGPT_TOKEN_AUTH_METHOD || "client_secret_post";
  const chatgptConfigured =
    Boolean(env.AUTH_CHATGPT_ID) &&
    (tokenMethod === "none" || Boolean(env.AUTH_CHATGPT_SECRET)) &&
    ["none", "client_secret_post", "client_secret_basic"].includes(tokenMethod);
  return [
    {
      id: "google",
      name: "Google",
      enabled: Boolean(
        (env.AUTH_GOOGLE_ID || env.GOOGLE_CLIENT_ID) &&
        (env.AUTH_GOOGLE_SECRET || env.GOOGLE_CLIENT_SECRET),
      ),
    },
    {
      id: "facebook",
      name: "Facebook",
      enabled: Boolean(env.AUTH_FACEBOOK_ID && env.AUTH_FACEBOOK_SECRET),
    },
    { id: "chatgpt", name: "ChatGPT", enabled: chatgptConfigured },
  ];
}
