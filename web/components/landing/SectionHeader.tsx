import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

export function SectionHeader({ eyebrow, title, children, align = "center", className }: { eyebrow: string; title: ReactNode; children?: ReactNode; align?: "center" | "left"; className?: string }) {
  return (
    <Reveal className={cn(align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="h-display mt-5 text-[34px] sm:text-[44px] lg:text-[52px]">{title}</h2>
      {children && <div className="mt-5 text-[17px] text-muted sm:text-[18px]">{children}</div>}
    </Reveal>
  );
}

export function Section({ id, alt, children, className, labelledBy }: { id?: string; alt?: boolean; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("relative overflow-hidden py-20 sm:py-28 lg:py-[136px]", alt ? "bg-bg-alt" : "bg-bg", className)}>
      <div className="relative mx-auto max-w-page px-5 sm:px-8">{children}</div>
    </section>
  );
}
