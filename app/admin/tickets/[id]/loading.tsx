// Skeleton for ticket detail page
export default function TicketDetailLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="skeleton skeleton-title" style={{ width: "200px" }} />
            <div className="skeleton" style={{ width: "80px", height: "24px", borderRadius: "999px" }} />
          </div>
          <div className="skeleton skeleton-text" style={{ width: "120px" }} />
        </div>
        <div className="skeleton" style={{ width: "140px", height: "38px" }} />
      </div>

      <div className="ticket-detail-grid">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Ticket info card */}
          <div className="skeleton-card">
            <div className="skeleton skeleton-title" style={{ width: "160px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <div className="skeleton skeleton-text" style={{ width: "70px" }} />
                  <div className="skeleton skeleton-text" style={{ width: "110px" }} />
                </div>
              ))}
            </div>
          </div>

          {/* Notes card */}
          <div className="skeleton-card">
            <div className="skeleton skeleton-title" style={{ width: "180px" }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-text" style={{ width: `${80 - i * 10}%` }} />
            ))}
          </div>

          {/* Chat skeleton */}
          <div className="skeleton-card" style={{ minHeight: "300px" }}>
            <div className="skeleton skeleton-title" style={{ width: "100px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
              {[40, 60, 35, 55, 45].map((w, i) => (
                <div key={i} style={{ display: "flex", justifyContent: i % 2 === 0 ? "flex-start" : "flex-end" }}>
                  <div className="skeleton" style={{ width: `${w}%`, height: "40px", borderRadius: "1rem" }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="skeleton-card">
          <div className="skeleton skeleton-title" style={{ width: "140px" }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border-light)" }}>
              <div className="skeleton" style={{ width: "70px", height: "24px", borderRadius: "999px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: "120px" }} />
                <div className="skeleton skeleton-text" style={{ width: "90px" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
