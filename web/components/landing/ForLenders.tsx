import { VaultCardMock } from "@/components/diagrams/VaultCardMock";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHeader } from "./SectionHeader";

export function ForLenders() {
  return (
    <Section id="lenders" alt labelledBy="lenders-title">
      <SectionHeader eyebrow="For lenders" title={<span id="lenders-title">Short-term yield backed by lab invoices.</span>}>
        Deposit tUSD8 into an ERC-4626 vault with one permit signature. Advances are short, confirmed by the paying lab, and repaid to the vault before the vendor.
      </SectionHeader>
      <Reveal className="mx-auto mt-14 max-w-4xl">
        <VaultCardMock />
      </Reveal>
    </Section>
  );
}
