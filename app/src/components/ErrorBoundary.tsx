import { Component, type ErrorInfo, type ReactNode } from "react";

/** Catches render errors. Deliberately logs nothing about the error's data, which could include health records. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("Render error:", error.name);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
