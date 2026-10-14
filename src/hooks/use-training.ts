"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/data/db";
import { sessionLogs, todaysSession } from "@/data/sessions";
import { loadTrainingContext } from "@/data/training";

/** Live engine context (re-evaluates when any underlying table changes). null = not set up. */
export function useTrainingContext() {
  return useLiveQuery(async () => (await loadTrainingContext(getDB())) ?? null, []);
}

export function useTodaySession() {
  return useLiveQuery(async () => (await todaysSession(getDB())) ?? null, []);
}

export function useSessionLogs(sessionId: string | undefined) {
  return useLiveQuery(async () => (sessionId ? sessionLogs(getDB(), sessionId) : []), [sessionId]);
}
