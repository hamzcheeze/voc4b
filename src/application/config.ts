export type AppMode = "demo" | "live" | "unconfigured";
export function appMode(env: Record<string, string | undefined>): AppMode {
  if (env.APP_MODE === "demo") return "demo";
  const configured = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    env.AUTH_SECRET,
  ];
  if (configured.every(Boolean)) return "live";
  if (
    env.APP_MODE === "live" ||
    configured.some(Boolean) ||
    env.NODE_ENV === "production"
  )
    return "unconfigured";
  return "demo";
}
