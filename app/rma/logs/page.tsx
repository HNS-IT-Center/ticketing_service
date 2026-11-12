import { redirect } from "next/navigation";
import { requirePage } from "@/lib/page-access";

/** Moved to /logs (one page, the kind is a filter); kept so old links and bookmarks still land. */
export default async function OldLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("page_log_rma");
  const qs = new URLSearchParams({ jenis: "rma" });
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string" && key !== "jenis") qs.set(key, value);
  }
  redirect(`/logs?${qs}`);
}
