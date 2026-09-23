export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <div className="skeleton" style={{ height: "0.8rem", width: "9rem", borderRadius: "6px" }} />
        <div className="skeleton" style={{ height: "1.5rem", width: "16rem", borderRadius: "6px", marginTop: "0.6rem" }} />
      </div>
      <div className="ticket-detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="skeleton" style={{ height: "16rem", width: "100%", borderRadius: "var(--radius-lg)" }} />
          <div className="skeleton" style={{ height: "24rem", width: "100%", borderRadius: "var(--radius-lg)" }} />
        </div>
        <div className="skeleton" style={{ height: "18rem", width: "100%", borderRadius: "var(--radius-lg)" }} />
      </div>
    </div>
  );
}
