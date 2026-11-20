import type { Metadata } from "next";
import { AgentsView } from "@/components/app/views/AgentsView";
export const metadata: Metadata = { title: "Agents console" };
export default function Page() {
  return <AgentsView />;
}
