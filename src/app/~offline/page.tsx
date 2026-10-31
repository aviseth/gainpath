import type { Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/components/ui";

export const metadata: Metadata = { title: "Offline · Gainpath" };

/** Shown only for a page that was never opened online. Everything else works offline. */
export default function OfflinePage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="px-1">You&apos;re offline</h1>
      <p className="px-1 text-on-surface-variant">
        This page hasn&apos;t been loaded on this device yet. Today, your session and your gym all
        work offline; your data is saved on the device and syncs when you&apos;re back online.
      </p>
      <Link href="/" className={`${linkClass} -ml-1 self-start`}>
        Go to Today
      </Link>
    </div>
  );
}
