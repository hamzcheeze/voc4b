import { auth } from "../auth";
import { authProviderOptions } from "../application/auth-providers";
import type { Metadata } from "next";
import { appMode } from "../application/config";
import {
  Workspace,
  type InitialWorkspaceSnapshot,
} from "../components/workspace";
import { SupabaseRepository, serviceClient } from "../adapters/supabase";
import { dayKey } from "../domain/vocabulary";
import { z } from "zod";
import "@fontsource-variable/inter";
import "@fontsource/pacifico/latin-400.css";
import { THEME_BOOTSTRAP } from "../components/theme-script";
import "./globals.css";
export const metadata: Metadata = {
  title: "Voc4b",
  description:
    "Learn two English words each day with pronunciation and clear definitions.",
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mode = appMode(process.env);
  const session = mode === "live" ? await auth() : null;
  let initialSnapshot: InitialWorkspaceSnapshot | undefined;
  if (mode === "live" && session?.user?.id) {
    const userId = session.user.id;
    try {
      const configuration = z
        .object({
          NEXT_PUBLIC_SUPABASE_URL: z.url(),
          SUPABASE_SECRET_KEY: z.string().min(1),
        })
        .parse(process.env);
      const repository = new SupabaseRepository(
        serviceClient(
          configuration.NEXT_PUBLIC_SUPABASE_URL,
          configuration.SUPABASE_SECRET_KEY,
        ),
        z.uuid().parse(userId),
      );
      const entries = await repository.list();
      initialSnapshot = {
        kind: "loaded",
        userId,
        today: dayKey(),
        entries,
      };
    } catch (error) {
      initialSnapshot = {
        kind: "failed",
        userId,
        today: dayKey(),
        error:
          error instanceof Error
            ? error.message
            : "Couldn't load your words. Please try again.",
      };
    }
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="darkreader-lock" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Workspace
          mode={mode}
          session={session}
          providers={authProviderOptions(process.env)}
          initialSnapshot={initialSnapshot}
        >
          {children}
        </Workspace>
      </body>
    </html>
  );
}
