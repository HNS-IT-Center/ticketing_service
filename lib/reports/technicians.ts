/**
 * The technician target report: what each technician's month of service work
 * came to — jobs from the Daftar Jasa counted, their takings added, their
 * points summed.
 *
 * Pure: rows in, summaries out, so the page and the tests share one set of
 * sums. Which tickets belong to a month is decided by the loader
 * (technicians-data.ts): a service ticket counts in the month it FIRST
 * reached `done`, credited to the technician holding it.
 */

export type TechnicianRef = { id: string; name: string };

/** One "Jasa service" line of a ticket that counts in the month. */
export type TargetLine = {
  ticketId: string;
  technicianId: string;
  /** Null on an older line typed before the Daftar Jasa: counted apart, not per job. */
  jobId: string | null;
  /** The line's own name — the job's name when it was recorded. */
  jobName: string;
  quantity: number;
  unitPrice: number | null;
  /** The job's points when the line was recorded. */
  points: number | null;
};

export type JobCount = { jobId: string; name: string; count: number };

export type TechnicianTarget = {
  technician: TechnicianRef;
  /** Service tickets finished in the month. */
  tickets: number;
  /** Jobs done, by quantity. */
  jobs: number;
  /** Takings from jobs: price × quantity over the priced lines. */
  revenue: number;
  /** Job lines still without a selling price — the takings are short by these. */
  unpriced: number;
  points: number;
  /** Labour lines typed instead of picked: work done, but not countable per job. */
  untyped: number;
  byJob: JobCount[];
};

export type TargetSummary = {
  rows: TechnicianTarget[];
  /** Every job done in the month, most frequent first. */
  jobs: JobCount[];
  totals: { tickets: number; jobs: number; revenue: number; points: number; unpriced: number; untyped: number };
};

function byCountThenName(a: JobCount, b: JobCount): number {
  return b.count - a.count || a.name.localeCompare(b.name, "id");
}

export function summarizeTargets(
  technicians: readonly TechnicianRef[],
  doneTickets: readonly { ticketId: string; technicianId: string }[],
  lines: readonly TargetLine[]
): TargetSummary {
  const rows = new Map<string, TechnicianTarget & { jobMap: Map<string, JobCount> }>();
  const ensure = (ref: TechnicianRef) => {
    let row = rows.get(ref.id);
    if (!row) {
      row = { technician: ref, tickets: 0, jobs: 0, revenue: 0, unpriced: 0, points: 0, untyped: 0, byJob: [], jobMap: new Map() };
      rows.set(ref.id, row);
    }
    return row;
  };
  const names = new Map(technicians.map((t) => [t.id, t]));
  for (const t of technicians) ensure(t);

  for (const t of doneTickets) ensure(names.get(t.technicianId) ?? { id: t.technicianId, name: "(teknisi tidak dikenal)" }).tickets += 1;

  const overall = new Map<string, JobCount>();
  for (const line of lines) {
    const row = ensure(names.get(line.technicianId) ?? { id: line.technicianId, name: "(teknisi tidak dikenal)" });
    if (line.jobId === null) {
      row.untyped += line.quantity;
      continue;
    }
    row.jobs += line.quantity;
    row.points += (line.points ?? 0) * line.quantity;
    if (line.unitPrice === null) row.unpriced += 1;
    else row.revenue += line.unitPrice * line.quantity;

    const mine = row.jobMap.get(line.jobId) ?? { jobId: line.jobId, name: line.jobName, count: 0 };
    mine.count += line.quantity;
    row.jobMap.set(line.jobId, mine);
    const all = overall.get(line.jobId) ?? { jobId: line.jobId, name: line.jobName, count: 0 };
    all.count += line.quantity;
    overall.set(line.jobId, all);
  }

  const out: TechnicianTarget[] = [...rows.values()].map(({ jobMap, ...row }) => ({
    ...row,
    byJob: [...jobMap.values()].sort(byCountThenName),
  }));
  out.sort(
    (a, b) =>
      b.points - a.points || b.jobs - a.jobs || b.tickets - a.tickets || a.technician.name.localeCompare(b.technician.name, "id")
  );

  const totals = out.reduce(
    (t, r) => ({
      tickets: t.tickets + r.tickets,
      jobs: t.jobs + r.jobs,
      revenue: t.revenue + r.revenue,
      points: t.points + r.points,
      unpriced: t.unpriced + r.unpriced,
      untyped: t.untyped + r.untyped,
    }),
    { tickets: 0, jobs: 0, revenue: 0, points: 0, unpriced: 0, untyped: 0 }
  );

  return { rows: out, jobs: [...overall.values()].sort(byCountThenName), totals };
}
