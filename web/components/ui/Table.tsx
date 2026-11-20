import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Table({ children, className, minWidth = 560, caption }: { children: ReactNode; className?: string; minWidth?: number; caption?: string }) {
  return (
    <div className={cn("-mx-5 overflow-x-auto sm:-mx-6", className)}>
      <table className="w-full border-collapse text-left text-[14px]" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={cn("whitespace-nowrap border-b border-line px-3 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.15em] text-muted first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)} {...p} />
);
export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("whitespace-nowrap border-b border-line px-3 py-3 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6", className)} {...p} />
);
export const Tr = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("transition-colors hover:bg-bg/70", className)} {...p} />;
