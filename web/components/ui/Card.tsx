import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn("card", padded && "p-5 sm:p-6", className)} {...rest} />;
}

export function CardHeader({ title, eyebrow, action, className, as: As = "h2" }: { title: ReactNode; eyebrow?: ReactNode; action?: ReactNode; className?: string; as?: "h2" | "h3" }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1 !text-[11.5px]">{eyebrow}</p>}
        <As className="text-[17px] font-semibold leading-snug text-ink">{title}</As>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <p className="eyebrow !text-[11.5px]">{label}</p>
        {icon && <span className="text-brand">{icon}</span>}
      </div>
      <div className="mono text-[26px] font-medium leading-none text-ink">{value}</div>
      {sub && <p className="text-[13px] text-muted">{sub}</p>}
    </Card>
  );
}
