import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Receivable } from "@/lib/autorail/types";
import { formatDate, pct } from "@/lib/autorail/format";
import { Amount } from "@/components/ui/Amount";
import { StateBadge } from "@/components/ui/Badge";
import { Table, Td, Th, Tr } from "@/components/ui/Table";

export function InvoicesTable({ items, counterparty = "buyer", showAdvance = true }: { items: Receivable[]; counterparty?: "buyer" | "seller"; showAdvance?: boolean }) {
  return (
    <Table caption="Invoices">
      <thead>
        <tr>
          <Th>Invoice</Th>
          <Th>{counterparty === "buyer" ? "Buyer" : "Vendor"}</Th>
          <Th className="text-right">Amount</Th>
          {showAdvance && <Th className="text-right">Advance</Th>}
          <Th>Due</Th>
          <Th>State</Th>
          <Th><span className="sr-only">Open</span></Th>
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <Tr key={r.id}>
            <Td>
              <Link href={`/app/invoices/${r.id}`} className="font-mono text-[13px] font-medium text-ink hover:text-brand hover:underline">
                {r.invoiceNumber}
              </Link>
            </Td>
            <Td className="text-text">{counterparty === "buyer" ? r.buyerName : r.sellerName}</Td>
            <Td className="text-right"><Amount value={r.amount} /></Td>
            {showAdvance && (
              <Td className="text-right">
                {r.advance ? (
                  <span className="font-mono text-[13px]">
                    <Amount value={r.advance.advanceAmount} symbol={false} /> <span className="text-muted">· {pct(r.advance.advanceBps)}</span>
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
            )}
            <Td className="font-mono text-[12.5px] text-muted">{formatDate(r.dueDate)}</Td>
            <Td><StateBadge state={r.state} /></Td>
            <Td className="text-right">
              <Link href={`/app/invoices/${r.id}`} className="inline-grid h-8 w-8 place-items-center rounded-btn text-muted hover:bg-ink/5 hover:text-brand" aria-label={`Open ${r.invoiceNumber}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
