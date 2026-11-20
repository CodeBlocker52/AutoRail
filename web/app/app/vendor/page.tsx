import type { Metadata } from "next";
import { VendorView } from "@/components/app/views/VendorView";
export const metadata: Metadata = { title: "Vendor" };
export default function Page() {
  return <VendorView />;
}
