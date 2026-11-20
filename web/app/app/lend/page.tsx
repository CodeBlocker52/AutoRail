import type { Metadata } from "next";
import { LendView } from "@/components/app/views/LendView";
export const metadata: Metadata = { title: "Lender" };
export default function Page() {
  return <LendView />;
}
