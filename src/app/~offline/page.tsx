import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline · Gainpath" };

/** Shown only for a page that was never opened online. Everything else works offline. */
export default function OfflinePage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-zinc-400">
        This page hasn&apos;t been loaded on this device yet. Today, your session and your gym all
        work offline; your data is saved on the device and syncs when you&apos;re back online.
      </p>
      <Link href="/" className="text-zinc-100 underline decoration-1 underline-offset-4">
        Go to Today
      </Link>
    </div>
  );
}
