// Skeleton for profile pages (technician, admin)
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "720px", margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div>
        <div className="skeleton skeleton-title" style={{ width: "180px" }} />
        <div className="skeleton skeleton-text" style={{ width: "240px", marginTop: "0.5rem" }} />
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "1rem" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="stat-card">
            <div className="skeleton" style={{ width: "2rem", height: "2rem", borderRadius: "0.5rem" }} />
            <div>
              <div className="skeleton skeleton-title" style={{ width: "40px" }} />
              <div className="skeleton skeleton-text" style={{ width: "70px", marginTop: "0.25rem" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Form card skeleton */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div className="skeleton skeleton-title" style={{ width: "140px" }} />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div className="skeleton skeleton-text" style={{ width: "80px" }} />
            <div className="skeleton" style={{ height: "2.5rem", borderRadius: "0.5rem" }} />
          </div>
        ))}
        <div className="skeleton" style={{ height: "2.5rem", width: "120px", borderRadius: "0.5rem", alignSelf: "flex-end" }} />
      </div>
    </div>
  );
}
