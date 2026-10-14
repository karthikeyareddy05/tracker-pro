import { Capacitor } from "@capacitor/core";
import { HealthStore } from "./healthStore";

let storePromise: Promise<HealthStore> | null = null;

/**
 * Opens the on-device health database once per app launch.
 * If it can't be opened the promise rejects — there is deliberately no
 * in-memory fallback, so records are never silently lost.
 */
export function openHealthStore(): Promise<HealthStore> {
  if (storePromise) return storePromise;
  const opening = (async () => {
    if (Capacitor.isNativePlatform()) {
      const { createNativeDriver } = await import("./nativeDriver");
      return HealthStore.open(await createNativeDriver());
    }
    const { createWebDriver } = await import("./webDriver");
    return HealthStore.open(await createWebDriver());
  })();
  storePromise = opening;
  opening.catch(() => {
    storePromise = null; // allow "Try again"
  });
  return opening;
}

export { HealthStore } from "./healthStore";
export { StorageError } from "./driver";
