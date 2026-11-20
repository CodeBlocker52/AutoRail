import type { Metadata } from "next";
import { Providers } from "@/components/app/Providers";
import { DesignView } from "@/components/app/views/DesignView";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

export default function DesignPage() {
  return (
    <Providers>
      <DesignView />
    </Providers>
  );
}
