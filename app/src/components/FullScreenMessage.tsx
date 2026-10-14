import { BrandMark } from "./Icon";

export function FullScreenMessage({
  title,
  body,
  loading,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="fullscreen" aria-busy={loading || undefined}>
      <BrandMark className="brand-mark" />
      {loading && <span className="spinner" aria-hidden="true" />}
      <h1 style={{ fontSize: "1.35rem" }}>{title}</h1>
      {body && <p>{body}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn btn--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </main>
  );
}
