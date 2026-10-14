import type { Metadata } from "next";
import { CheckGymScreen } from "./check-gym-screen";

export const metadata: Metadata = { title: "Check my gym · Gainpath" };

export default function CheckGymPage() {
  return <CheckGymScreen />;
}
