import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "inverted" | "link";
type Size = "md" | "sm" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "rounded-btn bg-brand text-white hover:bg-brand-hover",
  secondary: "rounded-btn border border-line bg-surface text-ink hover:border-brand-line hover:bg-brand-soft/60",
  ghost: "rounded-btn text-text hover:bg-ink/5",
  danger: "rounded-btn border border-danger/30 bg-surface text-danger hover:bg-danger-soft",
  inverted: "rounded-btn bg-white text-brand hover:bg-brand-soft",
  link: "text-brand underline-offset-4 hover:underline px-0",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[14px]",
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-7 text-[16px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], variant === "link" ? "h-auto" : sizes[size], className);
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href, variant = "primary", size = "md", className, children, icon, external,
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; icon?: ReactNode; external?: boolean }) {
  const cls = buttonClass(variant, size, className);
  if (external)
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer">
        {children}
        {icon}
      </a>
    );
  return (
    <Link href={href} className={cls}>
      {children}
      {icon}
    </Link>
  );
}
