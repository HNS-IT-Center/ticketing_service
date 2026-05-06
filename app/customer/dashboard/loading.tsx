export default function CustomerDashboardLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <div className="skeleton skeleton-title" style={{ width: "240px" }} />
        <div className="skeleton skeleton-text" style={{ width: "180px", marginTop: "0.5rem" }} />
      </div>

      {/* Stat cards grid */}
      <div className="customer-stats-grid">
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

      {/* Recent tickets */}
      <div className="skeleton-card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="skeleton skeleton-title" style={{ width: "140px" }} />
          <div className="skeleton skeleton-text" style={{ width: "60px" }} />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ padding: "0.625rem 0", borderBottom: "1px solid var(--border-light)", display: "flex", gap: "1rem", alignItems: "center" }}>
            <div className="skeleton skeleton-text" style={{ width: "100px" }} />
            <div className="skeleton skeleton-text" style={{ width: "80px" }} />
            <div className="skeleton" style={{ width: "70px", height: "20px", borderRadius: "999px", marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
