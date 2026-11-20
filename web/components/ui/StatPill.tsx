import { cn } from "@/lib/cn";

export function StatPill({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-line bg-brand-soft px-3.5 py-2 text-[13px] text-text sm:px-4 sm:text-[14.5px]", className)}>
      <strong className="font-semibold text-ink">{value}</strong>
      <span>{label}</span>
    </span>
  );
}
