import type { Metadata } from "next";
import { ProgressScreen } from "./progress-screen";

export const metadata: Metadata = { title: "Progress · Gainpath" };

export default function ProgressPage() {
  return <ProgressScreen />;
}
