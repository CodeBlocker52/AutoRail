import type { Metadata } from "next";
import { Providers } from "@/components/app/Providers";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = { title: { default: "App", template: "%s · Autorail" } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
