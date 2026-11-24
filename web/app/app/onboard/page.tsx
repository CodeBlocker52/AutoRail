import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardView } from "@/components/app/views/OnboardView";
export const metadata: Metadata = { title: "Get started" };
export default function Page() {
  return (
    <Suspense>
      <OnboardView />
    </Suspense>
  );
}
