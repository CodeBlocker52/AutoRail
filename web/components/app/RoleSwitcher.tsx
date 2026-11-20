"use client";
import { useRouter } from "next/navigation";
import { ROLES, useRole } from "@/hooks/useRole";
import type { Role } from "@/lib/autorail/types";
import { Tabs } from "@/components/ui/Tabs";

/** Demo role switcher: changes the acting wallet (mock mode) and jumps to that role's screen. */
export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const router = useRouter();
  const go = (r: Role) => {
    setRole(r);
    router.push(ROLES.find((x) => x.id === r)!.href);
  };
  return (
    <>
      <div className="hidden md:block" aria-label="Acting as">
        <Tabs size="sm" items={ROLES.map((r) => ({ id: r.id, label: r.label }))} value={role} onChange={go} />
      </div>
      <label className="md:hidden">
        <span className="sr-only">Acting as</span>
        <select value={role} onChange={(e) => go(e.target.value as Role)} className="h-9 rounded-btn border border-line bg-surface px-2 text-[13px] font-medium text-ink">
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
