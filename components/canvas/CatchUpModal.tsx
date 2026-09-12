"use client";

export default function CatchUpModal({
  summary,
  loading,
  onClose,
}: {
  summary: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Catch-up"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        zIndex: 100,
      }}
    >
      <button aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 16, right: 16 }}>
        ×
      </button>
      {loading ? <p>Catching you up…</p> : <p style={{ maxWidth: 480, textAlign: "center" }}>{summary}</p>}
      {!loading && <button onClick={onClose}>Got it</button>}
    </div>
  );
}
