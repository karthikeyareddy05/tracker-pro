import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { ApiClient } from "./auth/api";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import type { TokenStore } from "./auth/tokenStore";
import { AppShell } from "./components/AppShell";
import { FullScreenMessage } from "./components/FullScreenMessage";
import { PublicOnly, RequireAuth, RequireProfile, StorageGate } from "./components/guards";
import { LoadingBlock } from "./components/ui";
import { useAndroidBackButton, useHideSplash } from "./lib/native";
import type { HealthStore } from "./storage/healthStore";

import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import ForgotPasswordPage from "./pages/forgot-password";
import ResetPasswordPage from "./pages/reset-password";
import SetupPage from "./pages/setup";
import HomePage from "./pages/_index";

// Secondary tabs load on demand to keep startup fast.
const CalendarPage = lazy(() => import("./pages/calendar"));
const TrackPage = lazy(() => import("./pages/track"));
const InsightsPage = lazy(() => import("./pages/insights"));
const ProfilePage = lazy(() => import("./pages/profile"));

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export interface AppDeps {
  api?: ApiClient;
  tokenStore?: TokenStore;
  openStore?: () => Promise<HealthStore>;
  queryClient?: QueryClient;
}

export function AppProviders({ children, deps = {} }: { children: ReactNode; deps?: AppDeps }) {
  const [client] = useState(() => deps.queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider api={deps.api} tokenStore={deps.tokenStore}>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

function NativeIntegration() {
  const { status } = useAuth();
  useHideSplash(status !== "loading");
  useAndroidBackButton();
  return null;
}

export function AppRoutes({ openStore }: { openStore?: () => Promise<HealthStore> }) {
  return (
    <>
      <NativeIntegration />
      <Suspense fallback={<LoadingBlock />}>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<StorageGate open={openStore} />}>
              <Route path="/setup" element={<SetupPage />} />
              <Route element={<RequireProfile />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/track" element={<TrackPage />} />
                  <Route path="/insights" element={<InsightsPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                </Route>
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export function AppErrorFallback() {
  return (
    <FullScreenMessage
      title="Something went wrong"
      body="Tracker Pro hit an unexpected problem. Your saved records are safe on this phone."
      actionLabel="Reload"
      onAction={() => window.location.reload()}
    />
  );
}
