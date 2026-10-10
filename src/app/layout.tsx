import type { Metadata } from "next";
import { appMode } from "../application/config";
import { Workspace } from "../components/workspace";
import "@fontsource-variable/inter";
import { THEME_BOOTSTRAP } from "../components/theme-script";
import "@fontsource-variable/noto-sans-thai";
import "./globals.css";
export const metadata: Metadata = {
  title: "two words — สมุดคำศัพท์วันละสองคำ",
  description:
    "เรียนรู้คำศัพท์ภาษาอังกฤษวันละสองคำ พร้อมคำอ่านและคำอธิบายที่เข้าใจง่าย",
};
export const dynamic = "force-dynamic";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          ข้ามไปเนื้อหา
        </a>
        <Workspace mode={appMode(process.env)}>{children}</Workspace>
      </body>
    </html>
  );
}
