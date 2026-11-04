/**
 * Load the vendor list (prisma/data/vendors.ts) into a database.
 *
 *   npm run import:vendors              (dry run, the default — shows what would change)
 *   npm run import:vendors -- --apply
 *
 * Unlike `npm run seed`, safe against staging and production: it only adds
 * vendors and brings existing ones to the list's roles, location and contact. It
 * never deletes or reactivates; it renames only a vendor named under `formerly`.
 * Rules in lib/vendor-import.ts.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";
import { describeVendorImport, importVendors } from "../lib/vendor-import";
import { VENDOR_LIST } from "../prisma/data/vendors";
import { databaseHost } from "./lib/prompt";

config({ path: ".env.local" });

async function main() {
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ adapter: new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS) });
  try {
    console.log(`Database: ${databaseHost()}`);
    console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (tidak ada yang diubah)"}`);
    console.log(`Daftar: ${VENDOR_LIST.length} vendor`);
    const plan = await importVendors(db, VENDOR_LIST, { apply });
    for (const line of describeVendorImport(plan)) console.log(line);
    if (!apply && plan.create.length + plan.update.length > 0) {
      console.log("\nJalankan lagi dengan --apply untuk menyimpan.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
