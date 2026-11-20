"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

const KEY = "autorail:testnet-banner-dismissed";

/** Thin testnet notice, dismissible for the browser session. */
export function TestnetBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(window.sessionStorage.getItem(KEY) !== "1"), []);
  if (!show) return null;
  return (
    <div role="note" className="flex items-center justify-center gap-3 border-b border-warning/20 bg-[#FBF3E2] px-10 py-1.5 text-center text-[12.5px] text-warning">
      <p>
        <strong className="font-semibold">Testnet only</strong> · tUSD8 has no monetary value · Contracts unaudited
      </p>
      <button
        onClick={() => {
          window.sessionStorage.setItem(KEY, "1");
          setShow(false);
        }}
        className="absolute right-3 grid h-6 w-6 place-items-center rounded hover:bg-warning/10"
        aria-label="Dismiss testnet notice"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
