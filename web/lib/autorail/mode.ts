/**
 * App data mode, chosen at RUNTIME (not only at build time):
 *   onchain = Live (Aevum)   ·   mock = Demo data (in-memory, nothing onchain)
 * Precedence: URL `?mode=demo|live` → localStorage → NEXT_PUBLIC_AUTORAIL_MODE (production default: onchain).
 */
export type AppMode = "onchain" | "mock";

/** Build-time default. Unset → onchain, so production runs live even if the variable is forgotten. */
export const DEFAULT_MODE: AppMode = process.env.NEXT_PUBLIC_AUTORAIL_MODE === "mock" ? "mock" : "onchain";
const KEY = "autorail:mode";

let runtime: AppMode = DEFAULT_MODE;
/** The mode in effect (set by ModeProvider after mount; the default during SSR). */
export const currentMode = () => runtime;
export const setRuntimeMode = (m: AppMode) => void (runtime = m);

const fromParam = (v: string | null): AppMode | null => (v === "demo" || v === "mock" ? "mock" : v === "live" || v === "onchain" ? "onchain" : null);

/** Resolve the mode in the browser (URL wins and is persisted). */
export function resolveMode(): AppMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const fromUrl = fromParam(new URLSearchParams(window.location.search).get("mode"));
  try {
    if (fromUrl) window.localStorage.setItem(KEY, fromUrl);
    const stored = fromParam(window.localStorage.getItem(KEY));
    return fromUrl ?? stored ?? DEFAULT_MODE;
  } catch {
    return fromUrl ?? DEFAULT_MODE;
  }
}

/** Switch mode: persist, reflect in the URL (`?mode=demo` / `?mode=live`), reload so every client and cache restarts. */
export function switchMode(m: AppMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, m);
  } catch {
    /* private mode */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("mode", m === "mock" ? "demo" : "live");
  window.location.replace(url.toString());
}
