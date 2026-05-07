"use client";

import { useState } from "react";
import { FileDown, X, Printer } from "lucide-react";

interface Row {
  id: string;
  name: string;
  shift: string | null;
  workDays: string[];
  tickets: number;
  success: number;
  failed: number;
  points: number;
  currentLoad: number;
  maxLoad: number;
  details?: Record<string, { count: number; totalHours: number; timedCount: number }>;
}

interface Props {
  rows: Row[];
  filterMonth: number | null;
  filterYear: number | null;
  monthLabel: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ExportToPDF({ rows, filterMonth, filterYear, monthLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [selMonth, setSelMonth] = useState<string>(filterMonth ? String(filterMonth) : "");
  const [selYear, setSelYear] = useState<string>(filterYear ? String(filterYear) : String(new Date().getFullYear()));

  const handlePrint = () => {
    const period = selMonth
      ? `${MONTHS[parseInt(selMonth) - 1]} ${selYear}`
      : `All Time — ${selYear}`;

    const rankEmoji = (i: number) =>
      i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

    const topTech = rows[0];
    const topTechCard = topTech ? `
      <div style="background: linear-gradient(135deg, #0f172a, #1e3a8a); color: white; border-radius: 16px; padding: 1.5rem; margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="color: #fbbf24; font-weight: 800; font-size: 1.25rem; margin-bottom: 0.25rem;">
            👑 ${monthLabel === "All Time" ? "Technician of the Year" : "Technician of the Month"}
          </div>
          <div style="font-size: 2rem; font-weight: 800; margin-bottom: 0.5rem;">${topTech.name}</div>
          <div style="color: #94a3b8; font-size: 0.9rem;">
            ${topTech.success} Completed • ${topTech.points} Points Earned • ${Math.round((topTech.success / topTech.tickets) * 100 || 0)}% Win Rate
          </div>
        </div>
        <div style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); padding: 1rem 1.5rem; border-radius: 12px; text-align: center;">
          <div style="font-size: 2.5rem; font-weight: 800; color: #f8fafc;">#1</div>
        </div>
      </div>
    ` : "";

    const tableRows = rows
      .map(
        (p, i) => {
          let detailsHtml = "";
          if (p.details) {
            detailsHtml = `<div class="details-grid">` + Object.entries(p.details).map(([type, stats]) => {
              const avg = stats.timedCount > 0 ? (stats.totalHours / stats.timedCount).toFixed(1) : null;
              const typeLabel = type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
              return `<div class="detail-box"><strong>${typeLabel}:</strong> ${stats.count} <span class="detail-avg">${avg ? `(Avg: ${avg} H)` : "(No time track)"}</span></div>`;
            }).join("") + `</div>`;
          }

          return `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td class="rank">${rankEmoji(i)}</td>
        <td>
          <div class="name">${p.name}</div>
          ${detailsHtml}
        </td>
        <td>${p.shift ? `<span class="shift">${p.shift}</span>` : "—"}</td>
        <td class="num">${p.tickets}</td>
        <td class="num success">${p.success}</td>
        <td class="num failed">${p.failed}</td>
        <td class="num points">${p.points} pts</td>
      </tr>`;
        }
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Performance Report — HNS IT Center</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: #f7f2ec;
    color: #1a1a2e;
    padding: 2.5rem;
    font-size: 13px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* ── Header ── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 2rem;
    padding-bottom: 1.25rem;
    border-bottom: 2px solid #16469d;
  }
  .logo-row { display: flex; align-items: center; gap: 0.75rem; }
  .logo-box {
    width: 42px; height: 42px;
    background: #16469d;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 800; font-size: 15px;
  }
  .brand { font-size: 1.1rem; font-weight: 800; color: #16469d; }
  .brand-sub { font-size: 0.75rem; color: #718096; margin-top: 1px; }
  .report-meta { text-align: right; }
  .report-title { font-size: 1rem; font-weight: 700; color: #1a1a2e; }
  .report-period {
    display: inline-block;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #16469d;
    background: #e8eef9;
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
  }
  .report-date { font-size: 0.7rem; color: #718096; margin-top: 0.25rem; }
  /* ── Summary bar ── */
  .summary {
    display: flex; gap: 1rem;
    margin-bottom: 1.75rem;
  }
  .stat {
    flex: 1;
    background: #fff;
    border: 1px solid #ede7de;
    border-radius: 10px;
    padding: 0.875rem 1rem;
  }
  .stat-val { font-size: 1.4rem; font-weight: 800; color: #16469d; }
  .stat-label { font-size: 0.7rem; color: #718096; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.04em; }
  /* ── Table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #ede7de;
    box-shadow: 0 1px 4px rgba(22,70,157,0.06);
  }
  thead th {
    background: #f7f2ec;
    padding: 0.6rem 0.9rem;
    text-align: left;
    font-size: 0.65rem;
    font-weight: 700;
    color: #4a5568;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    border-bottom: 1px solid #ddd6cf;
  }
  thead th.num { text-align: right; }
  tbody tr { border-bottom: 1px solid #f0ebe3; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr.even { background: #fdfcfb; }
  tbody td { padding: 0.65rem 0.9rem; vertical-align: middle; }
  tbody td.num { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .rank { font-weight: 800; color: #16469d; font-size: 0.9rem; width: 36px; }
  .name { font-weight: 600; color: #1a1a2e; }
  .sub { font-size: 0.7rem; color: #718096; margin-top: 1px; }
  .shift {
    background: #e8eef9;
    color: #16469d;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: capitalize;
  }
  .success { color: #16a34a; }
  .failed  { color: #cd2426; }
  .points  { color: #16469d; }
  .details-grid { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; }
  .detail-box { font-size: 0.65rem; background: #e8eef9; color: #1a1a2e; padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid #c3d2ec; }
  .detail-avg { color: #4a5568; }
  
  /* Prevent rows and summary from splitting across pages */
  tr, .summary { page-break-inside: avoid; }
  
  /* ── Footer ── */
  .footer {
    margin-top: 1.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #ddd6cf;
    display: flex;
    justify-content: space-between;
    font-size: 0.68rem;
    color: #718096;
  }
  /* ── Print ── */
  @media print {
    body { background: #fff; padding: 1.5cm; }
    .stat { box-shadow: none; }
    table { box-shadow: none; }
    @page { margin: 15mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo-row">
      <div class="logo-box">HNS</div>
      <div>
        <div class="brand">HNS IT Center</div>
        <div class="brand-sub">Technical Service Division</div>
      </div>
    </div>
    <div class="report-meta">
      <div class="report-title">${monthLabel === "All Time" ? "Technician of the Year Report" : `Technician of the Month Report`}</div>
      <div class="report-period">${period}</div>
      <div class="report-date">Generated: ${new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}</div>
    </div>
  </div>

  ${topTechCard}

  <div class="summary">
    <div class="stat">
      <div class="stat-val">${rows.length}</div>
      <div class="stat-label">Technicians</div>
    </div>
    <div class="stat">
      <div class="stat-val">${rows.reduce((a, r) => a + r.tickets, 0)}</div>
      <div class="stat-label">Total Tickets</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#16a34a">${rows.reduce((a, r) => a + r.success, 0)}</div>
      <div class="stat-label">Completed</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#cd2426">${rows.reduce((a, r) => a + r.failed, 0)}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat">
      <div class="stat-val">${rows.reduce((a, r) => a + r.points, 0)}</div>
      <div class="stat-label">Total Points</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Technician</th>
        <th>Shift</th>
        <th class="num">Tickets</th>
        <th class="num">Done</th>
        <th class="num">Failed</th>
        <th class="num">Points</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    <span>HNS IT Center — Internal Document</span>
    <span>Confidential · Not for Distribution</span>
  </div>

  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Please allow popups to export PDF"); return; }
    win.document.write(html);
    win.document.close();
    setOpen(false);
  };

  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <FileDown size={15} />
        Export PDF
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "380px" }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Export Performance Report</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  Choose period for the PDF report
                </p>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}><X size={18}/></button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Month</label>
                <select
                  className="form-input"
                  value={selMonth}
                  onChange={(e) => setSelMonth(e.target.value)}
                >
                  <option value="">All months</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Year</label>
                <select
                  className="form-input"
                  value={selYear}
                  onChange={(e) => setSelYear(e.target.value)}
                >
                  {[2024, 2025, 2026].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div style={{ padding: "0.75rem", background: "var(--cream)", borderRadius: "var(--radius-md)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                💡 A new tab will open with a branded PDF ready to print/save. Uses your browser's built-in PDF engine — no file size overhead.
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ flex: 1 }}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handlePrint} style={{ flex: 2 }}>
                  <Printer size={14} /> Open & Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
