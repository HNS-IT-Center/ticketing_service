// Skeleton for ticket list pages (table + filter tabs)
export default function TicketListLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div className="skeleton skeleton-title" style={{ width: "140px" }} />
          <div className="skeleton skeleton-text" style={{ width: "200px" }} />
        </div>
        <div className="skeleton" style={{ width: "120px", height: "38px" }} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {[80, 60, 90, 60, 80, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{ width: `${w}px`, height: "32px" }} />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="table-wrapper">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["120px", "100px", "120px", "90px", "120px", "90px", "60px"].map((w, i) => (
                <th key={i} style={{ padding: "0.75rem 1rem", textAlign: "left", background: "var(--cream)", borderBottom: "1px solid var(--border)" }}>
                  <div className="skeleton skeleton-text" style={{ width: w }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                {["100px", "90px", "110px", "80px", "100px", "80px", "60px"].map((w, j) => (
                  <td key={j} style={{ padding: "0.875rem 1rem" }}>
                    <div className="skeleton skeleton-text" style={{ width: w }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
