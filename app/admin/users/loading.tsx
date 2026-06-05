// Skeleton for admin users list page
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="skeleton skeleton-title" style={{ width: "120px" }} />
          <div className="skeleton skeleton-text" style={{ width: "200px", marginTop: "0.5rem" }} />
        </div>
        <div className="skeleton" style={{ width: "110px", height: "2.25rem", borderRadius: "0.5rem" }} />
      </div>

      {/* Filter + search bar */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ width: "70px", height: "2rem", borderRadius: "0.5rem" }} />
        ))}
        <div className="skeleton" style={{ width: "180px", height: "2rem", borderRadius: "0.5rem" }} />
      </div>

      {/* Table skeleton */}
      <div className="skeleton-card">
        <div style={{ display: "flex", gap: "1rem", padding: "0.875rem", borderBottom: "2px solid var(--border-light)" }}>
          {["Name", "Email", "Role", "Action"].map((h) => (
            <div key={h} className="skeleton skeleton-text" style={{ width: "80px" }} />
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem", borderBottom: "1px solid var(--border-light)" }}>
            <div className="skeleton skeleton-text" style={{ width: "130px", flex: 1 }} />
            <div className="skeleton skeleton-text" style={{ width: "180px", flex: 2 }} />
            <div className="skeleton" style={{ width: "70px", height: "1.5rem", borderRadius: "999px" }} />
            <div className="skeleton" style={{ width: "60px", height: "2rem", borderRadius: "0.5rem" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
