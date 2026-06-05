// Skeleton for the leaderboard page — podium + ranked list
export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div>
        <div className="skeleton skeleton-title" style={{ width: "200px" }} />
        <div className="skeleton skeleton-text" style={{ width: "250px", marginTop: "0.5rem" }} />
      </div>

      {/* Tab toggles skeleton */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="skeleton" style={{ width: "80px", height: "2rem", borderRadius: "0.5rem" }} />
        <div className="skeleton" style={{ width: "80px", height: "2rem", borderRadius: "0.5rem" }} />
      </div>

      {/* Podium skeleton */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: "1rem", padding: "1.5rem 0" }}>
        {[{ h: "120px", w: "90px" }, { h: "160px", w: "100px" }, { h: "100px", w: "90px" }].map((s, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
            <div className="skeleton" style={{ width: "3rem", height: "3rem", borderRadius: "50%" }} />
            <div className="skeleton" style={{ width: s.w, height: s.h, borderRadius: "0.5rem 0.5rem 0 0" }} />
          </div>
        ))}
      </div>

      {/* Ranked rows skeleton */}
      <div className="card">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.875rem", borderBottom: "1px solid var(--border-light)" }}>
            <div className="skeleton skeleton-text" style={{ width: "2rem" }} />
            <div className="skeleton" style={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%" }} />
            <div className="skeleton skeleton-text" style={{ width: "140px", flex: 1 }} />
            <div className="skeleton skeleton-text" style={{ width: "60px" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
