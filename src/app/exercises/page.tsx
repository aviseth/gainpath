import type { Metadata } from "next";
import { ExercisesScreen } from "./exercises-screen";

export const metadata: Metadata = { title: "Exercises · Liftwise" };

export default function ExercisesPage() {
  return <ExercisesScreen />;
}
