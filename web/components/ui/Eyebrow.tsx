import { cn } from "@/lib/cn";

export function Eyebrow({ children, className, marker = true }: { children: React.ReactNode; className?: string; marker?: boolean }) {
  return (
    <p className={cn("eyebrow inline-flex items-center gap-2.5", className)}>
      {marker && <span aria-hidden className="h-1.5 w-1.5 bg-brand" />}
      {children}
    </p>
  );
}
