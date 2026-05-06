export default function PerformanceLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div className="skeleton skeleton-title" style={{ width: "220px" }} />
          <div className="skeleton skeleton-text" style={{ width: "180px", marginTop: "0.5rem" }} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <div className="skeleton" style={{ width: "110px", height: "38px" }} />
          <div className="skeleton" style={{ width: "80px", height: "38px" }} />
          <div className="skeleton" style={{ width: "70px", height: "38px" }} />
          <div className="skeleton" style={{ width: "120px", height: "38px" }} />
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["40px", "80px", "140px", "80px", "100px", "80px", "70px", "60px", "70px"].map((w, i) => (
                <th key={i} style={{ padding: "0.75rem 1rem", background: "var(--cream)", borderBottom: "1px solid var(--border)" }}>
                  <div className="skeleton skeleton-text" style={{ width: w }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border-light)" }}>
                {["30px", "60px", "120px", "60px", "110px", "60px", "50px", "50px", "50px"].map((w, j) => (
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
