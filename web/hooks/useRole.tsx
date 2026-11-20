"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import type { Address, Role } from "@/lib/autorail";
import { useClient } from "./useClient";

const RoleContext = createContext<{ role: Role; setRole: (r: Role) => void }>({ role: "vendor", setRole: () => {} });
const STORAGE_KEY = "autorail:role";
export const ROLES: { id: Role; label: string; href: string }[] = [
  { id: "lender", label: "Lender", href: "/app/lend" },
  { id: "vendor", label: "Vendor", href: "/app/vendor" },
  { id: "lab", label: "Lab", href: "/app/lab" },
  { id: "agents", label: "Agents", href: "/app/agents" },
];

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("vendor");
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Role | null;
    if (saved && ROLES.some((r) => r.id === saved)) setRoleState(saved);
  }, []);
  const setRole = (r: Role) => {
    setRoleState(r);
    window.localStorage.setItem(STORAGE_KEY, r);
  };
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export const useRole = () => useContext(RoleContext);

/** Address acting for a role: scripted wallet in mock mode, connected wallet onchain. */
export function useActor(role?: Role): Address | undefined {
  const { role: current } = useRole();
  const { address } = useAccount();
  return useClient().resolveActor(role ?? current, address);
}
