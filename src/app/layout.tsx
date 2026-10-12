import { auth } from "../auth";
import { authProviderOptions } from "../application/auth-providers";
import type { Metadata } from "next";
import { appMode } from "../application/config";
import { Workspace } from "../components/workspace";
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
        >
          {children}
        </Workspace>
      </body>
    </html>
  );
}
