import type { Metadata } from "next";
import { ExercisesScreen } from "./exercises-screen";

export const metadata: Metadata = { title: "Exercises · Gainpath" };

export default function ExercisesPage() {
  return <ExercisesScreen />;
}
