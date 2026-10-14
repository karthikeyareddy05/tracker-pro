import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Icon, type IconName } from "./Icon";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/calendar", label: "Calendar", icon: "calendar" },
  { to: "/track", label: "Track", icon: "track" },
  { to: "/insights", label: "Insights", icon: "insights" },
  { to: "/profile", label: "Profile", icon: "profile" },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      <ul>
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "active" : undefined)}>
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function OfflineBar() {
  const { offline, retryConnection } = useAuth();
  if (!offline) return null;
  return (
    <div className="offline-bar" role="status">
      <Icon name="wifiOff" size={16} />
      <span>Offline — your on-device records still work.</span>
      <button type="button" className="link-btn small" onClick={() => void retryConnection()}>
        Retry
      </button>
    </div>
  );
}

/** Layout for the five primary screens. */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="app-shell">
      <OfflineBar />
      {children ?? <Outlet />}
      <BottomNav />
    </div>
  );
}
