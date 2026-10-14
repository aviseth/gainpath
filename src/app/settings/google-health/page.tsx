import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleHealthReturn } from "./google-health-return";

export const metadata: Metadata = { title: "Google Health · Liftwise" };

export default function GoogleHealthPage() {
  return (
    <Suspense>
      <GoogleHealthReturn />
    </Suspense>
  );
}
