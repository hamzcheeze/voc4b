export type AppMode = "demo" | "live" | "unconfigured";
export function appMode(env: Record<string, string | undefined>): AppMode {
  if (env.APP_MODE === "demo") return "demo";
  const configured = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
