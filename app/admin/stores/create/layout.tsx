import { requireRole } from "@/lib/session";

/** The page is a client form; its door is here. Stores are Administrator only. */
export default async function CreateStoreLayout({ children }: { children: React.ReactNode }) {
  await requireRole("Administrator");
  return children;
}
