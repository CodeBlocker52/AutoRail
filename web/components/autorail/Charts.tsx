"use client";
import { Area, AreaChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReputationEntry, VaultPoint } from "@/lib/autorail/types";
import { formatAmount, formatDateTime, formatTime } from "@/lib/autorail/format";
import { EmptyState } from "@/components/ui/EmptyState";

const BRAND = "#1F4A3D";
const MUTED = "#6E6D66";
const LINE = "#E4E2DA";
const axis = { fontSize: 11, fill: MUTED, fontFamily: "var(--font-mono)" };

function TipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-btn border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="font-mono text-[11px] text-muted">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="text-[13px] text-text">
          {k} <span className="font-mono text-ink">{v}</span>
        </p>
      ))}
    </div>
  );
}

/** Single series: vault utilisation (%) over time. */
export function VaultUtilisationChart({ history }: { history: VaultPoint[] }) {
  if (history.length < 2) return <EmptyState title="Not enough history yet" className="h-[220px] justify-center">Utilisation appears after deposits and advances.</EmptyState>;
  const data = history.map((p) => ({ t: p.timestamp, util: p.utilizationBps / 100, assets: p.totalAssets }));
  // Carry the latest value forward to now so a step chart doesn't end on a spike.
  const last = data[data.length - 1];
  const nowTs = Math.floor(Date.now() / 1000);
  if (nowTs > last.t + 60) data.push({ ...last, t: nowTs });
  return (
    <figure>
      <div className="h-[220px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={LINE} vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => formatTime(t).slice(0, 5)} tick={axis} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={32} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={axis} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload;
                if (!p) return null;
                return <TipBox title={formatDateTime(p.t)} rows={[["Utilisation", `${p.util.toFixed(1)}%`], ["Vault assets", `${formatAmount(p.assets)} tUSD8`]]} />;
              }}
            />
            <Area type="stepAfter" dataKey="util" stroke={BRAND} strokeWidth={2} fill={BRAND} fillOpacity={0.1} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only"><table>
        <caption>Vault utilisation over time</caption>
        <thead><tr><th>Time</th><th>Utilisation</th><th>Vault assets (tUSD8)</th></tr></thead>
        <tbody>{data.map((d, i) => <tr key={i}><td>{formatDateTime(d.t)}</td><td>{d.util.toFixed(1)}%</td><td>{formatAmount(d.assets)}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}

/** Single series: ERC-8004 reputation score (0–100), one point per feedback event. */
export function ReputationChart({ entries }: { entries: ReputationEntry[] }) {
  if (!entries.length) return <EmptyState title="No reputation entries" className="h-[220px] justify-center" />;
  const data = entries.map((e, i) => ({ n: i + 1, t: e.timestamp, score: e.score, note: e.note, limit: e.advanceLimit }));
  return (
    <figure>
      <div className="h-[220px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 22, right: 16, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={LINE} vertical={false} />
            <XAxis
              dataKey="n"
              type="number"
              domain={[0.5, Math.max(data.length, 2) + 0.5]}
              ticks={data.map((d) => d.n)}
              allowDecimals={false}
              tickFormatter={(n: number) => `#${n}`}
              tick={axis}
              axisLine={{ stroke: LINE }}
              tickLine={false}
              label={{ value: "Feedback event", position: "insideBottomRight", offset: -2, fontSize: 10, fill: MUTED }}
            />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axis} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload;
                if (!p) return null;
                return <TipBox title={`#${p.n} · ${formatDateTime(p.t)}`} rows={[[p.note, ""], ["Score", String(p.score)], ["Advance limit", `${formatAmount(p.limit)} tUSD8`]]} />;
              }}
            />
            <Line type="stepAfter" dataKey="score" stroke={BRAND} strokeWidth={2} dot={{ r: 5, fill: BRAND, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false}>
              <LabelList dataKey="score" position="top" offset={10} style={{ fontSize: 11, fill: "#16160F", fontFamily: "var(--font-mono)" }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 font-mono text-[11px] text-muted">Score by event: {data.map((d) => d.score).join(" → ")}</figcaption>
      <div className="sr-only"><table>
        <caption>Reputation score history</caption>
        <thead><tr><th>Event</th><th>Time</th><th>Entry</th><th>Score</th><th>Advance limit</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.n}><td>#{d.n}</td><td>{formatDateTime(d.t)}</td><td>{d.note}</td><td>{d.score}</td><td>{formatAmount(d.limit)}</td></tr>)}</tbody>
      </table></div>
    </figure>
  );
}
