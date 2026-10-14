import type { ReactNode } from "react";
import { BrandMark } from "../components/Icon";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="auth-layout">
      <div className="auth-inner">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Tracker Pro</span>
        </div>
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="lede">{subtitle}</p>}
        </div>
        <div className="card">{children}</div>
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </main>
  );
}
