"use client";
import { useState } from "react";
import { useActor, useBalances, useClient, useLenderPosition, useReceivables, useTx, useVault } from "@/hooks";
import { formatAmount, parseTokenInput, pct } from "@/lib/autorail/format";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { TokenInput } from "@/components/ui/TokenInput";
import { TxStatus } from "@/components/ui/TxStatus";
import { FaucetHint } from "@/components/autorail/FaucetHint";
import { InvoicesTable } from "@/components/autorail/InvoicesTable";
import { VaultUtilisationChart } from "@/components/autorail/Charts";

export function LendView() {
  const client = useClient();
  const lender = useActor("lender");
  const { data: bal } = useBalances(lender);
  const { data: pos } = useLenderPosition(lender);
  const { data: vault } = useVault();
  const receivables = useReceivables();
  const [dep, setDep] = useState("");
  const [wd, setWd] = useState("");
  const depTx = useTx("Deposit with permit");
  const wdTx = useTx("Withdraw");
  const depV = parseTokenInput(dep);
  const wdV = parseTokenInput(wd);
  const active = receivables.data?.filter((r) => r.advance && (r.state === "Funded" || r.state === "Overdue")) ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Deposit" eyebrow="EIP-2612 permit" />
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!depV) return;
              if (await depTx.run((o) => client.depositWithPermit(depV, o))) setDep("");
            }}
          >
            <TokenInput label="Amount" value={dep} onChange={setDep} balance={bal?.tUSD8} />
            <Button type="submit" className="w-full" disabled={!depV || (bal && depV > bal.tUSD8)} loading={depTx.isBusy}>
              Deposit with permit
            </Button>
            <p className="text-[12.5px] text-muted">One signature (permit) and one transaction. No separate approve.</p>
            <TxStatus stage={depTx.stage} hash={depTx.hash} error={depTx.error} onDismiss={depTx.reset} labels={{ signing: "Sign permit" }} />
            <FaucetHint balances={bal} needed={depV} />
          </form>
        </Card>
        <Card>
          <CardHeader title="Withdraw" eyebrow="ERC-4626" />
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!wdV) return;
              if (await wdTx.run((o) => client.withdraw(wdV, o))) setWd("");
            }}
          >
            <TokenInput label="Amount" value={wd} onChange={setWd} max={pos?.maxWithdraw} hint={vault ? `Idle liquidity ${formatAmount(vault.idle)} tUSD8. Funds in active advances return at repayment.` : undefined} />
            <Button type="submit" variant="secondary" className="w-full" disabled={!wdV || (pos && wdV > pos.maxWithdraw)} loading={wdTx.isBusy}>
              Withdraw
            </Button>
            <TxStatus stage={wdTx.stage} hash={wdTx.hash} error={wdTx.error} onDismiss={wdTx.reset} />
          </form>
        </Card>
        <Card>
          <CardHeader title="Your position" eyebrow="Vault shares" />
          {pos ? (
            <dl className="space-y-4">
              <div>
                <dt className="text-[13px] text-muted">Value</dt>
                <dd className="mt-1 font-mono text-[30px] leading-none text-ink" title="ERC-4626 rounds down by up to 0.000001.">
                  {formatAmount(pos.value)} <span className="text-[14px] text-muted">tUSD8</span>
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-[14px]">
                <div>
                  <dt className="text-muted">Shares</dt>
                  <dd><Amount value={pos.shares} symbol={false} className="text-ink" /></dd>
                </div>
                <div>
                  <dt className="text-muted">Earned</dt>
                  <dd><Amount value={pos.earned} sign className="text-brand" /></dd>
                </div>
                <div>
                  <dt className="text-muted">Deposited</dt>
                  <dd><Amount value={pos.deposited} symbol={false} className="text-ink" /></dd>
                </div>
                <div>
                  <dt className="text-muted">
                    Est. APY{" "}
                    <span className="ml-0.5 rounded border border-line px-1 font-mono text-[10px] uppercase tracking-[0.08em]" title="Fees on active advances annualised over their term, divided by vault assets. INV-001: 0.06 fee × 365 ÷ 60 days ÷ 6.00 assets ≈ 6.1%.">
                      est.
                    </span>
                  </dt>
                  <dd className="font-mono text-ink">
                    {vault && vault.outstanding > 0n ? (
                      pct(vault.estApyBps, 1)
                    ) : (
                      <span title="no active advances" aria-label="Not available: no active advances">
                        —
                      </span>
                    )}
                  </dd>
                  <dd className="mt-0.5 text-[11.5px] leading-snug text-muted">Active fees × 365 ÷ term ÷ assets</dd>
                </div>
              </div>
            </dl>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Vault utilisation"
            eyebrow="Deployed ÷ total assets"
            action={vault && <span className="font-mono text-[20px] text-ink">{pct(vault.utilizationBps, 0)}</span>}
          />
          {vault ? <VaultUtilisationChart history={vault.history} /> : <Skeleton className="h-[220px] w-full" />}
        </Card>
        <Card>
          <CardHeader title="Vault" eyebrow="Totals" />
          {vault ? (
            <dl className="divide-y divide-line text-[14px]">
              {[
                ["Total assets", vault.totalAssets],
                ["Idle", vault.idle],
                ["Outstanding", vault.outstanding],
                ["Principal repaid", vault.repaidPrincipal],
                ["Fees earned", vault.feesEarned],
                ["Defaults", vault.defaults],
              ].map(([k, val]) => (
                <div key={k as string} className="flex justify-between py-2.5">
                  <dt className="text-muted">{k as string}</dt>
                  <dd><Amount value={val as bigint} className="text-ink" /></dd>
                </div>
              ))}
            </dl>
          ) : (
            <SkeletonRows rows={5} />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Active advances" eyebrow="Backed by lab-confirmed invoices" />
        {receivables.isLoading ? <SkeletonRows /> : active.length ? <InvoicesTable items={active} counterparty="seller" /> : <EmptyState title="No active advances">Advances appear here once the underwriter funds a confirmed invoice.</EmptyState>}
      </Card>
    </div>
  );
}
