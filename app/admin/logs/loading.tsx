// Skeleton for admin logs page
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <div className="skeleton skeleton-title" style={{ width: "160px" }} />
        <div className="skeleton skeleton-text" style={{ width: "260px", marginTop: "0.5rem" }} />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div className="skeleton" style={{ width: "150px", height: "2.5rem", borderRadius: "0.5rem" }} />
        <div className="skeleton" style={{ width: "120px", height: "2.5rem", borderRadius: "0.5rem" }} />
        <div className="skeleton" style={{ width: "180px", height: "2.5rem", borderRadius: "0.5rem" }} />
      </div>

      {/* Table skeleton */}
      <div className="skeleton-card">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem", borderBottom: "1px solid var(--border-light)" }}>
            <div className="skeleton skeleton-text" style={{ width: "90px" }} />
            <div className="skeleton skeleton-text" style={{ width: "80px", flex: 1 }} />
            <div className="skeleton skeleton-text" style={{ width: "120px", flex: 1 }} />
            <div className="skeleton" style={{ width: "70px", height: "1.5rem", borderRadius: "999px" }} />
            <div className="skeleton" style={{ width: "70px", height: "1.5rem", borderRadius: "999px" }} />
            <div className="skeleton skeleton-text" style={{ width: "80px" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
