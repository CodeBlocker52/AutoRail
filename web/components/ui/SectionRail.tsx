"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Right-edge progress rail: dots joined by a line; the active section's dot is filled. */
export function SectionRail({ sections, className }: { sections: { id: string; label: string }[]; className?: string }) {
  const [active, setActive] = useState(sections[0]?.id);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => {
      const first = els[0]?.getBoundingClientRect();
      const last = els[els.length - 1]?.getBoundingClientRect();
      if (!first || !last) return;
      setVisible(first.top < window.innerHeight * 0.6 && last.bottom > window.innerHeight * 0.4);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [sections]);

  return (
    <nav aria-label="Feature sections" className={cn("fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 transition-opacity duration-300 xl:block", visible ? "opacity-100" : "pointer-events-none opacity-0", className)}>
      <ol className="relative flex flex-col items-center gap-5">
        <span aria-hidden className="absolute bottom-1 top-1 w-px bg-brand-line" />
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id} className="group relative">
              <a href={`#${s.id}`} aria-label={s.label} aria-current={on ? "true" : undefined} className="relative block h-3 w-3">
                <span className={cn("absolute inset-0 rounded-full border transition-colors", on ? "border-brand bg-brand" : "border-brand-line bg-bg group-hover:border-brand")} />
              </a>
              <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.15em] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
