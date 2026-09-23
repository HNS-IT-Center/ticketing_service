export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <div className="skeleton" style={{ height: "1.5rem", width: "12rem", borderRadius: "6px" }} />
        <div className="skeleton" style={{ height: "0.9rem", width: "18rem", borderRadius: "6px", marginTop: "0.5rem" }} />
      </div>
      {[0, 1, 2].map((section) => (
        <div key={section} className="card">
          <div className="skeleton" style={{ height: "1.1rem", width: "14rem", borderRadius: "6px", marginBottom: "1rem" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {[0, 1].map((row) => (
              <div key={row} className="skeleton" style={{ height: "6rem", width: "100%", borderRadius: "var(--radius-md)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
