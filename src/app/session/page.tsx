import type { Metadata } from "next";
import { SessionScreen } from "./session-screen";

export const metadata: Metadata = { title: "Session · Liftwise" };

export default function SessionPage() {
  return <SessionScreen />;
}
