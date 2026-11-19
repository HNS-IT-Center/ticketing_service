import { requirePage } from "@/lib/page-access";

/** The page is a client form; its door is here. Stores are Administrator only. */
export default async function CreateStoreLayout({ children }: { children: React.ReactNode }) {
  await requirePage("manage_stores");
  return children;
}
