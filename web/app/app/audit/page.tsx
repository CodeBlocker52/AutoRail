import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditView } from "@/components/app/views/AuditView";
import { SkeletonRows } from "@/components/ui/Skeleton";
export const metadata: Metadata = { title: "Audit" };
export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <AuditView />
    </Suspense>
  );
}
