import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Public_Sans } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// Self-hosted at build time, so they work offline too.
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
});
const body = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans" });

export const metadata: Metadata = {
  title: "Gainpath",
  description: "Evidence-based strength training that adapts to your readiness and your gym.",
  applicationName: "Gainpath",
  appleWebApp: { capable: true, title: "Gainpath", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f2f1ec",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        {/* Service worker only in production builds; dev serves fresh files. */}
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV !== "production"}>
          <AppShell>{children}</AppShell>
        </SerwistProvider>
      </body>
    </html>
  );
}
