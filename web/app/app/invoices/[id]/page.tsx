import type { Metadata } from "next";
import { InvoiceView } from "@/components/app/views/InvoiceView";
export const metadata: Metadata = { title: "Invoice" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceView id={decodeURIComponent(id)} />;
}
