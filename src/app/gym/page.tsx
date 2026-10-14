import type { Metadata } from "next";
import { GymScreen } from "./gym-screen";

export const metadata: Metadata = { title: "My gym · Liftwise" };

export default function GymPage() {
  return <GymScreen />;
}
