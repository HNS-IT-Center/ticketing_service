/**
 * Fill `Ticket.device_brand` for tickets whose unit was picked from the
 * Accurate catalogue before the brand was stored.
 *
 *   npm run backfill:device-brand              (dry run, the default)
 *   npm run backfill:device-brand -- --apply
 *
 * Reads each item once from data.hnsitcenter.id by its id and applies
 * lib/catalog/brand.ts — the rule new tickets use. Touches only rows whose
 * brand is still empty; safe to run again. Typed units have no catalogue item
 * and are left alone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";
import { getCatalogItem, isCatalogConfigured } from "../lib/catalog/hns-data";
import { catalogBrand } from "../lib/catalog/brand";
import { databaseHost } from "./lib/prompt";

async function main() {
  const apply = process.argv.includes("--apply");
  if (!isCatalogConfigured()) throw new Error("HNS_API_URL / HNS_API_TOKEN belum diisi.");
  const db = new PrismaClient({ adapter: new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS) });
  try {
    console.log(`Database: ${databaseHost()}`);
    console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (tidak ada yang diubah)"}`);

    const tickets = await db.ticket.findMany({
      where: { device_catalog_item_id: { not: null }, device_brand: null },
      select: { id: true, ticket_code: true, device_catalog_item_id: true },
    });
    const ids = [...new Set(tickets.map((t) => t.device_catalog_item_id as number))];
    console.log(`Tiket tanpa brand: ${tickets.length} (${ids.length} barang katalog)`);

    const brandOf = new Map<number, string | null>();
    for (const id of ids) {
      const item = await getCatalogItem(id);
      brandOf.set(id, item ? catalogBrand(item) : null);
    }

    let filled = 0;
    for (const t of tickets) {
      const brand = brandOf.get(t.device_catalog_item_id as number) ?? null;
      console.log(`  ${t.ticket_code}: ${brand ?? "— (tidak diketahui)"}`);
      if (!brand) continue;
      filled++;
      if (apply) {
        await db.ticket.updateMany({ where: { id: t.id, device_brand: null }, data: { device_brand: brand } });
      }
    }
    console.log(`${apply ? "Diisi" : "Akan diisi"}: ${filled} tiket.`);
    if (!apply && filled > 0) console.log("Jalankan lagi dengan --apply untuk menyimpan.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
