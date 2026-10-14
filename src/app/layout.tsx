import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/next/react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gainpath",
  description: "Evidence-based strength training that adapts to your readiness and your gym.",
  applicationName: "Gainpath",
  appleWebApp: { capable: true, title: "Gainpath", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        {/* Service worker only in production builds; dev serves fresh files. */}
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV !== "production"}>
          <AppShell>{children}</AppShell>
        </SerwistProvider>
      </body>
    </html>
  );
}
