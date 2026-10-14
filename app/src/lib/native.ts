import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const ROOT_PATHS = new Set(["/", "/login"]);
const TAB_PATHS = new Set(["/calendar", "/track", "/insights", "/profile"]);

/** Hides the native splash screen once the first real screen has rendered. */
export function useHideSplash(ready: boolean) {
  useEffect(() => {
    if (!ready || !Capacitor.isNativePlatform()) return;
    import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 }))
      .catch(() => undefined);
  }, [ready]);
}

/**
 * Android hardware back button: close the app from a root screen, jump to Home
 * from another tab, otherwise go back in history.
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    import("@capacitor/app")
      .then(async ({ App }) => {
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          const path = location.pathname;
          // Let open dialogs close first.
          const dialog = document.querySelector(".dialog-backdrop");
          if (dialog) {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
            return;
          }
          if (ROOT_PATHS.has(path) || path === "/setup") {
            void App.exitApp();
          } else if (TAB_PATHS.has(path)) {
            navigate("/", { replace: true });
          } else if (canGoBack) {
            navigate(-1);
          } else {
            navigate("/", { replace: true });
          }
        });
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [location.pathname, navigate]);
}
