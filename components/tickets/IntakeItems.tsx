import { PackageCheck, PenLine } from "lucide-react";
import { DetailCard } from "./TicketSections";

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
    <li className="flex items-start justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col gap-1">
        {title && (
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
        )}
        <span className="text-sm font-semibold [overflow-wrap:anywhere]">{item.name}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {item.sku ? (
            <>
              <PackageCheck aria-hidden="true" className="size-[13px] text-tone-blue-fg" />
              SKU {item.sku}
              {item.catalog_category ? ` · ${item.catalog_category}` : ""}
            </>
          ) : (
            <>
              <PenLine aria-hidden="true" className="size-[13px]" />
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
    <DetailCard title="Komponen PC">
      <ul>
        {components.map((c) => (
          <ItemRow key={c.id} item={{ ...c, name: c.component_name }} />
        ))}
      </ul>
    </DetailCard>
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
    <DetailCard title="Upgrade">
      <ul>
        {details.map((d) =>
          d.item_name ? (
            <ItemRow key={d.id} title={d.upgrade.name} item={{ ...d, name: d.item_name }} />
          ) : (
            <li key={d.id} className="flex flex-col gap-1 border-t border-border py-2.5 first:border-t-0 first:pt-0">
              <span className="text-sm font-semibold">{d.upgrade.name}</span>
              <span className="text-xs text-muted-foreground">Barangnya tidak dicatat</span>
            </li>
          )
        )}
      </ul>
    </DetailCard>
  );
}
