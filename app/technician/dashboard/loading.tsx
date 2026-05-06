export default function TechnicianDashboardLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <div className="skeleton skeleton-title" style={{ width: "220px" }} />
        <div className="skeleton skeleton-text" style={{ width: "200px", marginTop: "0.5rem" }} />
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="skeleton" style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.75rem" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div className="skeleton skeleton-title" style={{ width: "50px" }} />
              <div className="skeleton skeleton-text" style={{ width: "80px" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Available tickets card */}
      <div className="skeleton-card">
        <div className="skeleton skeleton-title" style={{ width: "180px" }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ padding: "0.875rem", borderBottom: "1px solid var(--border-light)", display: "flex", gap: "1rem", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
              <div className="skeleton skeleton-text" style={{ width: "100px" }} />
              <div className="skeleton skeleton-text" style={{ width: "140px" }} />
            </div>
            <div className="skeleton" style={{ width: "80px", height: "32px" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
