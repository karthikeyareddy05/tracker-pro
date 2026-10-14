import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCycleProfile } from "../hooks/health";
import type { HealthStore } from "../storage/healthStore";
import { StorageProvider } from "../storage/StorageProvider";
import { FullScreenMessage } from "./FullScreenMessage";

/** Blocks protected screens until a session is established. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullScreenMessage title="Tracker Pro" loading />;
  if (status === "unauthenticated") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/register/forgot-password are only for signed-out users. */
export function PublicOnly() {
  const { status } = useAuth();
  if (status === "loading") return <FullScreenMessage title="Tracker Pro" loading />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Opens on-device storage for signed-in screens. */
export function StorageGate({ open }: { open?: () => Promise<HealthStore> }) {
  return (
    <StorageProvider open={open}>
      <Outlet />
    </StorageProvider>
  );
}

/** Sends users without a saved cycle profile to onboarding. */
export function RequireProfile() {
  const profile = useCycleProfile();
  if (profile.isPending) return <FullScreenMessage title="Loading your journal…" loading />;
  if (profile.isError) {
    return (
      <FullScreenMessage
        title="Couldn't read your journal"
        body={profile.error instanceof Error ? profile.error.message : "On-device storage couldn't be read."}
        actionLabel="Try again"
        onAction={() => void profile.refetch()}
      />
    );
  }
  if (!profile.data) return <Navigate to="/setup" replace />;
  return <Outlet />;
}
