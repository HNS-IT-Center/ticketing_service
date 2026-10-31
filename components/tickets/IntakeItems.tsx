import { PackageCheck, PenLine } from "lucide-react";

/**
 * What came in with a ticket as a list of items: a PC build's components and
 * the item fitted for each upgrade. One copy for the admin, technician and
 * sales ticket pages, so the three cannot drift — before 2026-10-26 only the
 * admin page showed a ticket's upgrades at all.
 */

type ItemLine = {
  name: string;
  sku: string | null;
  catalog_category: string | null;
  quantity: number;
};

function ItemRow({ item, title }: { item: ItemLine; title?: string }) {
  return (
    <li
      className="flex items-start justify-between gap-3"
      style={{ padding: "0.625rem 0", borderTop: "1px solid var(--border)" }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {title && (
          <span className="text-xs font-semibold" style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {title}
          </span>
        )}
        <span className="text-sm font-semibold" style={{ wordBreak: "break-word" }}>
          {item.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {item.sku ? (
            <>
              <PackageCheck size={13} style={{ color: "#1e40af" }} />
              SKU {item.sku}
              {item.catalog_category ? ` · ${item.catalog_category}` : ""}
            </>
          ) : (
            <>
              <PenLine size={13} />
              Diketik manual
            </>
          )}
        </span>
      </div>
      <span className="shrink-0 text-sm font-semibold">×{item.quantity}</span>
    </li>
  );
}

export function PcComponentsCard({
  components,
}: {
  components: { id: string; component_name: string; sku: string | null; catalog_category: string | null; quantity: number }[];
}) {
  if (components.length === 0) return null;
  return (
    <div className="card">
      <h3 style={{ marginBottom: "0.5rem" }}>Komponen PC</h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {components.map((c) => (
          <ItemRow key={c.id} item={{ ...c, name: c.component_name }} />
        ))}
      </ul>
    </div>
  );
}

export function UpgradesCard({
  details,
}: {
  details: {
    id: string;
    upgrade: { name: string };
    item_name: string | null;
    sku: string | null;
    catalog_category: string | null;
    quantity: number;
  }[];
}) {
  if (details.length === 0) return null;
  return (
    <div className="card">
      <h3 style={{ marginBottom: "0.5rem" }}>Upgrade</h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {details.map((d) =>
          d.item_name ? (
            <ItemRow key={d.id} title={d.upgrade.name} item={{ ...d, name: d.item_name }} />
          ) : (
            <li key={d.id} className="flex flex-col gap-1" style={{ padding: "0.625rem 0", borderTop: "1px solid var(--border)" }}>
              <span className="text-sm font-semibold">{d.upgrade.name}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Barangnya tidak dicatat
              </span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
