import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../auth/AuthProvider";
import type { CycleProfile } from "../lib/cycle";
import type { DateStr } from "../lib/dates";
import type { CycleProfileInput, DayFields, Symptom } from "../storage/healthStore";
import { useHealthStore } from "../storage/StorageProvider";
import { useToday } from "./useToday";

/** Every health query key starts with ["health", userId] so a user switch never reuses data. */
export const healthKeys = {
  all: (uid: string) => ["health", uid] as const,
  profile: (uid: string) => ["health", uid, "profile"] as const,
  periodStarts: (uid: string) => ["health", uid, "periodStarts"] as const,
  day: (uid: string, date: DateStr) => ["health", uid, "day", date] as const,
  days: (uid: string, from: DateStr, to: DateStr) => ["health", uid, "days", from, to] as const,
  checklist: (uid: string, date: DateStr) => ["health", uid, "checklist", date] as const,
  preferences: (uid: string) => ["health", uid, "preferences"] as const,
  counts: (uid: string) => ["health", uid, "counts"] as const,
};

// Local SQLite reads are fast and the device is the source of truth: don't
// refetch on focus and keep failures visible rather than retrying silently.
const local = { staleTime: Infinity, retry: false, networkMode: "always" } as const;

export function useCycleProfile() {
  const { id } = useUser();
  const store = useHealthStore();
  return useQuery({ queryKey: healthKeys.profile(id), queryFn: () => store.getCycleProfile(id), ...local });
}

export function usePeriodStarts() {
  const { id } = useUser();
  const store = useHealthStore();
  return useQuery({ queryKey: healthKeys.periodStarts(id), queryFn: () => store.listPeriodStarts(id), ...local });
}

export function useDay(date: DateStr) {
  const { id } = useUser();
  const store = useHealthStore();
  return useQuery({ queryKey: healthKeys.day(id, date), queryFn: () => store.getDay(id, date), ...local });
}

export function useDays(from: DateStr, to: DateStr) {
  const { id } = useUser();
  const store = useHealthStore();
  return useQuery({ queryKey: healthKeys.days(id, from, to), queryFn: () => store.listDays(id, from, to), ...local });
}

export function useChecklist(date: DateStr) {
  const { id } = useUser();
  const store = useHealthStore();
  return useQuery({ queryKey: healthKeys.checklist(id, date), queryFn: () => store.getChecklist(id, date), ...local });
}

export function usePreferences() {
  const { id } = useUser();
  const store = useHealthStore();
  return useQuery({ queryKey: healthKeys.preferences(id), queryFn: () => store.getPreferences(id), ...local });
}

export function useRecordCounts() {
  const { id } = useUser();
  const store = useHealthStore();
  return useQuery({ queryKey: healthKeys.counts(id), queryFn: () => store.countRecords(id), ...local });
}

function useInvalidateHealth() {
  const { id } = useUser();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: healthKeys.all(id) });
}

export function useSaveCycleProfile() {
  const { id } = useUser();
  const store = useHealthStore();
  const qc = useQueryClient();
  const todayStr = useToday();
  return useMutation({
    mutationFn: (input: CycleProfileInput) => store.saveCycleProfile(id, input, todayStr),
    networkMode: "always",
    onSuccess: async (profile: CycleProfile) => {
      // Write the saved profile straight into the cache so route guards see it
      // immediately (prevents a redirect back to /setup), then refresh the rest.
      qc.setQueryData(healthKeys.profile(id), profile);
      await qc.invalidateQueries({
        queryKey: healthKeys.all(id),
        predicate: (q) => q.queryKey[2] !== "profile",
      });
    },
  });
}

export function useSaveDay() {
  const { id } = useUser();
  const store = useHealthStore();
  const invalidate = useInvalidateHealth();
  const todayStr = useToday();
  return useMutation({
    mutationFn: (args: { date: DateStr; patch: Partial<DayFields> & { symptoms?: Symptom[] } }) =>
      store.saveDay(id, args.date, args.patch, todayStr),
    networkMode: "always",
    onSuccess: invalidate,
  });
}

export function useDeleteDay() {
  const { id } = useUser();
  const store = useHealthStore();
  const invalidate = useInvalidateHealth();
  return useMutation({
    mutationFn: (date: DateStr) => store.deleteDay(id, date),
    networkMode: "always",
    onSuccess: invalidate,
  });
}

export function usePeriodStartMutations() {
  const { id } = useUser();
  const store = useHealthStore();
  const invalidate = useInvalidateHealth();
  const todayStr = useToday();
  const add = useMutation({
    mutationFn: (date: DateStr) => store.addPeriodStart(id, date, todayStr),
    networkMode: "always",
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (date: DateStr) => store.removePeriodStart(id, date),
    networkMode: "always",
    onSuccess: invalidate,
  });
  return { add, remove };
}

export function useSetChecklistItem() {
  const { id } = useUser();
  const store = useHealthStore();
  const invalidate = useInvalidateHealth();
  return useMutation({
    mutationFn: (args: { date: DateStr; key: string; done: boolean }) =>
      store.setChecklistItem(id, args.date, args.key, args.done),
    networkMode: "always",
    onSuccess: invalidate,
  });
}

export function useSetPreference() {
  const { id } = useUser();
  const store = useHealthStore();
  const invalidate = useInvalidateHealth();
  return useMutation({
    mutationFn: (args: { key: string; value: string }) => store.setPreference(id, args.key, args.value),
    networkMode: "always",
    onSuccess: invalidate,
  });
}

export function useDeleteLocalHealthData() {
  const { id } = useUser();
  const store = useHealthStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => store.deleteAllForUser(id),
    networkMode: "always",
    onSuccess: async () => {
      qc.removeQueries({ queryKey: healthKeys.all(id) });
    },
  });
}
