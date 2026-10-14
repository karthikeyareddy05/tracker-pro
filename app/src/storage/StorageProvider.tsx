import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { FullScreenMessage } from "../components/FullScreenMessage";
import type { HealthStore } from "./healthStore";
import { openHealthStore } from "./index";

const StoreContext = createContext<HealthStore | null>(null);

export function StorageProvider({
  children,
  open = openHealthStore,
}: {
  children: ReactNode;
  open?: () => Promise<HealthStore>;
}) {
  const [store, setStore] = useState<HealthStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    open()
      .then((s) => {
        if (!cancelled) setStore(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "On-device storage could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) {
    return (
      <FullScreenMessage
        title="Storage unavailable"
        body={`${error} Your health records are kept only on this phone, so Tracker Pro won't continue without it. Nothing has been deleted.`}
        actionLabel="Try again"
        onAction={retry}
      />
    );
  }
  if (!store) return <FullScreenMessage title="Opening your journal…" loading />;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useHealthStore(): HealthStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useHealthStore must be used inside <StorageProvider>");
  return store;
}
