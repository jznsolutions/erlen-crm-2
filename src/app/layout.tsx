import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.erlen-sales.de"),
  title: { default: "ERLEN Vertriebsagentur", template: "%s · ERLEN" },
  description: "ERLEN Vertriebsagentur – Karriere im Vertrieb mit leistungsabhängigem Einkommen.",
  applicationName: "ERLEN",
  // Bestätigung für die Google Search Console (Wert aus „HTML-Tag“, in Vercel als Umgebungsvariable)
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : undefined,
  appleWebApp: { capable: true, title: "ERLEN", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#060912",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-right" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
