import type { Metadata } from "next";
import { AccountSection } from "./account-section";
import { AdvancedSection } from "./advanced-section";
import { AiSection } from "./ai-section";
import { BackupSection } from "./backup-section";
import { DeviceSection } from "./device-section";
import { HealthSection } from "./health-section";
import { SyncSection } from "./sync-section";
import { TrainingSection } from "./training-section";

export const metadata: Metadata = { title: "Settings · Liftwise" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <TrainingSection />
      <AccountSection />
      <SyncSection />
      <HealthSection />
      <AiSection />
      <BackupSection />
      <AdvancedSection />
      <DeviceSection />
    </div>
  );
}
