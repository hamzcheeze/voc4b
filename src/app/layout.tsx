import type { Metadata } from "next";
import { appMode } from "../application/config";
import { Workspace } from "../components/workspace";
import "@fontsource-variable/inter";
import { THEME_BOOTSTRAP } from "../components/theme-script";
import "./globals.css";
export const metadata: Metadata = {
  title: "voc4b",
  description:
    "Learn two English words each day with pronunciation and clear definitions.",
};
export const dynamic = "force-dynamic";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Workspace mode={appMode(process.env)}>{children}</Workspace>
      </body>
    </html>
  );
}
