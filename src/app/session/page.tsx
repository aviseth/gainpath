import type { Metadata } from "next";
import { SessionScreen } from "./session-screen";

export const metadata: Metadata = { title: "Session · Gainpath" };

export default function SessionPage() {
  return <SessionScreen />;
}
