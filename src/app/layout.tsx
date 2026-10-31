import type { Metadata, Viewport } from "next";
import { Roboto_Flex } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

// Self-hosted at build time, so it works offline too. Variable font with the
// optical-size axis, so 28px headlines and 12px labels both look right.
const sans = Roboto_Flex({
  subsets: ["latin"],
  variable: "--font-roboto-flex",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Gainpath",
  description: "Evidence-based strength training that adapts to your readiness and your gym.",
  applicationName: "Gainpath",
  appleWebApp: { capable: true, title: "Gainpath", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8ff" },
    { media: "(prefers-color-scheme: dark)", color: "#121318" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-surface text-on-surface">
        {/* Service worker only in production builds; dev serves fresh files. */}
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV !== "production"}>
          <AppShell>{children}</AppShell>
        </SerwistProvider>
      </body>
    </html>
  );
}
