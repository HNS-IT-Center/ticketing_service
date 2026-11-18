import { ExternalLink, FileCheck2, PackageCheck, PenLine } from "lucide-react";
import FilePreview from "@/components/ui/FilePreview";
import { formatDateTime } from "@/lib/utils";
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
  detail,
  linkQuote,
}: {
  components: {
    id: string;
    component_name: string;
    sku: string | null;
    catalog_category: string | null;
    quantity: number;
    quote_label?: string | null;
  }[];
  /** The build's header: which quotation the list came from and who checked it. */
  detail?: {
    quote_code: string | null;
    quote_url: string | null;
    quote_sales_name?: string | null;
    /** From the e-commerce API: the revision that was ticked and the quotation's page on the web. */
    quote_revision?: number | null;
    quote_public_url?: string | null;
    verified_at: Date | null;
    verified_by_name: string | null;
  } | null;
  /** "Tautkan quotation", for a build that has none and a viewer who may link it. */
  linkQuote?: React.ReactNode;
}) {
  // A build with no components yet can still name its sales (typed at intake).
  const typedSales = !detail?.quote_code ? detail?.quote_sales_name : null;
  const linkSlot = !detail?.quote_code ? linkQuote : null;
  // An old build linked to its quotation afterwards may hold no components;
  // the card still says which quotation it was sold on.
  if (components.length === 0 && !typedSales && !linkSlot && !detail?.quote_code) return null;
  const fromQuote = components.filter((c) => c.quote_label);
  const added = components.filter((c) => !c.quote_label);
  return (
    <DetailCard title="Komponen PC">
      {linkSlot && <div className="mb-3">{linkSlot}</div>}
      {typedSales && (
        <p className="mb-3 text-sm">
          <span className="text-muted-foreground">Sales:</span> <span className="font-semibold text-foreground">{typedSales}</span>
        </p>
      )}
      {detail?.quote_code && (
        <div className="mb-3 flex flex-col gap-1.5 rounded-lg border border-tone-green-border bg-tone-green-bg px-3 py-2.5 text-sm text-tone-green-fg">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <FileCheck2 aria-hidden="true" className="size-4 shrink-0" />
            <span>
              Dari quotation <span className="font-mono font-semibold">{detail.quote_code}</span>
              {typeof detail.quote_revision === "number" && <span className="text-xs"> rev. {detail.quote_revision}</span>}
            </span>
            {detail.quote_public_url && (
              <a
                href={detail.quote_public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-2 md:min-h-0"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" /> Buka di web
              </a>
            )}
            {detail.quote_url && (
              <FilePreview
                url={detail.quote_url}
                fileType="pdf"
                label="Lihat PDF"
                title={`Quotation ${detail.quote_code}`}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 font-medium underline underline-offset-2 md:min-h-0"
              />
            )}
          </span>
          {detail.quote_sales_name && (
            <span className="text-xs">
              Sales di quotation: <span className="font-semibold">{detail.quote_sales_name}</span>
            </span>
          )}
          {detail.verified_at && (
            <span className="text-xs">
              {fromQuote.length} barang dicek sesuai dengan barang yang dibawa
              {detail.verified_by_name ? ` oleh ${detail.verified_by_name}` : ""}, {formatDateTime(detail.verified_at)}.
            </span>
          )}
        </div>
      )}
      <ul>
        {fromQuote.map((c) => (
          <ItemRow key={c.id} title={c.quote_label ?? undefined} item={{ ...c, name: c.component_name }} />
        ))}
        {added.length > 0 && fromQuote.length > 0 && (
          <li className="border-t border-border pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Komponen tambahan (di luar quotation)
          </li>
        )}
        {added.map((c) => (
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
