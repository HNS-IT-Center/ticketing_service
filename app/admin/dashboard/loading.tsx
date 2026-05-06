export default function DashboardLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {/* Header */}
      <div>
        <div className="skeleton skeleton-title" style={{ width: "200px" }} />
        <div className="skeleton skeleton-text" style={{ width: "260px", marginTop: "0.5rem" }} />
      </div>

      {/* Stats grid */}
      <div className="admin-stats-grid">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="skeleton" style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.75rem" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="skeleton skeleton-title" style={{ width: "60px" }} />
              <div className="skeleton skeleton-text" style={{ width: "90px" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent tickets card */}
      <div className="skeleton-card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="skeleton skeleton-title" style={{ width: "140px" }} />
          <div className="skeleton skeleton-text" style={{ width: "60px" }} />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border-light)" }}>
            <div className="skeleton skeleton-text" style={{ width: "100px" }} />
            <div className="skeleton skeleton-text" style={{ width: "80px" }} />
            <div className="skeleton skeleton-text" style={{ width: "100px" }} />
            <div className="skeleton" style={{ width: "70px", height: "20px", borderRadius: "999px" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
