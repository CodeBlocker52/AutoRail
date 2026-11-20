"use client";
import { useEffect, useId, useState } from "react";
import type { Address, JobWallet } from "@/lib/autorail/types";
import { formatAmount, parseTokenInput, toInputString, tusd } from "@/lib/autorail/format";
import { useClient } from "@/hooks/useClient";
import { useTx } from "@/hooks/useTx";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TokenInput } from "@/components/ui/TokenInput";
import { TxStatus } from "@/components/ui/TxStatus";

const EXPIRY_HOURS = [1, 2, 4, 6, 12, 24, 48, 72, 120, 168];
const fmtHours = (h: number) => (h < 24 ? `${h}h` : `${h / 24}d`);
const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

export function GrantSessionModal({ open, onClose, wallet, defaultKey }: { open: boolean; onClose: () => void; wallet: JobWallet; defaultKey?: Address }) {
  const client = useClient();
  const tx = useTx("Grant session");
  const id = useId();
  const [key, setKey] = useState<string>(defaultKey ?? "");
  const [label, setLabel] = useState("Payout agent");
  const [payees, setPayees] = useState<Address[]>(wallet.payees.map((p) => p.address));
  const [perTx, setPerTx] = useState("1.20");
  const [total, setTotal] = useState(toInputString(wallet.balance));
  const [expiryIdx, setExpiryIdx] = useState(5);

  useEffect(() => {
    if (open) {
      tx.reset();
      setKey(defaultKey ?? "");
      // Sensible defaults that are always valid for the remaining balance.
      const per = wallet.balance < tusd("1.20") ? wallet.balance : tusd("1.20");
      setPerTx(toInputString(per));
      setTotal(toInputString(wallet.balance));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const perTxV = parseTokenInput(perTx);
  const totalV = parseTokenInput(total);
  const errors = {
    key: key && !isAddr(key) ? "Enter a 0x address (40 hex characters)." : undefined,
    payees: payees.length === 0 ? "Pick at least one payee." : undefined,
    caps: perTxV !== null && totalV !== null && perTxV > totalV ? "The per-payment cap can't exceed the total cap." : undefined,
  };
  const valid = isAddr(key) && !!perTxV && !!totalV && !errors.payees && !errors.caps;
  const hours = EXPIRY_HOURS[expiryIdx];

  const submit = async () => {
    if (!valid) return;
    const res = await tx.run((o) =>
      client.grantSession(wallet.address, { key: key as Address, label, payees, perTxCap: perTxV!, totalCap: totalV!, expiresAt: Math.floor(Date.now() / 1000) + hours * 3600 }, o),
    );
    if (res) setTimeout(onClose, 900);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Grant session"
      description="Give an agent a scoped key for this JobWallet. Limits are enforced onchain."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid} loading={tx.isBusy}>
            Grant session
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_0.7fr]">
          <div>
            <label htmlFor={`${id}-key`} className="label">Session key address</label>
            <input id={`${id}-key`} className="field font-mono !text-[13px]" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="0x…" aria-invalid={!!errors.key} spellCheck={false} data-autofocus />
            {errors.key && <p className="mt-1 text-[12.5px] text-danger">{errors.key}</p>}
          </div>
          <div>
            <label htmlFor={`${id}-label`} className="label">Label</label>
            <input id={`${id}-label`} className="field" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>

        <fieldset>
          <legend className="label">Approved payees</legend>
          <div className="space-y-2">
            {wallet.payees.map((p) => {
              const on = payees.includes(p.address);
              return (
                <label key={p.address} className={`flex cursor-pointer items-center gap-3 rounded-btn border px-3 py-2.5 ${on ? "border-brand-line bg-brand-soft/50" : "border-line"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={on} onChange={() => setPayees((cur) => (on ? cur.filter((a) => a !== p.address) : [...cur, p.address]))} />
                  <span className="text-[14px] text-ink">{p.label}</span>
                  <span className="ml-auto font-mono text-[11.5px] text-muted">{p.address.slice(0, 6)}…{p.address.slice(-4)}</span>
                </label>
              );
            })}
          </div>
          {errors.payees && <p className="mt-1 text-[12.5px] text-danger">{errors.payees}</p>}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TokenInput label="Per-payment cap" value={perTx} onChange={setPerTx} max={wallet.balance} />
          <TokenInput label="Total cap" value={total} onChange={setTotal} max={wallet.balance} hint={`JobWallet balance ${formatAmount(wallet.balance)}`} error={errors.caps} />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`${id}-exp`} className="label !mb-0">Expiry</label>
            <span className="font-mono text-[13px] text-ink">{fmtHours(hours)}</span>
          </div>
          <input
            id={`${id}-exp`}
            type="range"
            min={0}
            max={EXPIRY_HOURS.length - 1}
            step={1}
            value={expiryIdx}
            onChange={(e) => setExpiryIdx(Number(e.target.value))}
            aria-valuetext={fmtHours(hours)}
            className="w-full accent-[rgb(var(--brand))]"
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
            <span>1h</span>
            <span>24h</span>
            <span>7d</span>
          </div>
        </div>
        <TxStatus stage={tx.stage} hash={tx.hash} error={tx.error} onDismiss={tx.reset} />
      </form>
    </Modal>
  );
}
