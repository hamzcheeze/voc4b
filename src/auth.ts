import "server-only";
import NextAuth from "next-auth";
import { SupabaseAdapter } from "@auth/supabase-adapter";
import { createAuthConfig } from "./application/auth-config";
import { appMode } from "./application/config";
import { z } from "zod";

const adapter =
  appMode(process.env) === "live"
    ? SupabaseAdapter(
        z.object({ url: z.url(), secret: z.string().min(1) }).parse({
          url: process.env.NEXT_PUBLIC_SUPABASE_URL,
          secret: process.env.SUPABASE_SECRET_KEY,
        }),
      )
    : undefined;
export const { handlers, auth, signIn, signOut } = NextAuth(
  createAuthConfig(process.env, adapter),
);
