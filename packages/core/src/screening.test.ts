import { describe, expect, it } from "vitest";
import { screenInvoice, type Invoice, type Payee, type PastPayment } from "./screening";

const NOW = new Date("2026-11-25T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

const adire: Payee = {
  id: "p1",
  name: "Adire Fabrics Ltd",
  kind: "supplier",
  wallet: "0x1111111111111111111111111111111111111111",
  walletSince: new Date(NOW.getTime() - 90 * day),
  agreedPrices: [{ item: "Ankara (6 yards)", unitPrice: 18_000_000_000n }],
};
const tailor: Payee = { id: "p2", name: "Chioma Okeke", kind: "staff", wallet: "0x2222222222222222222222222222222222222222", walletSince: new Date(NOW.getTime() - 200 * day), agreedPrices: [] };

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    from: "Adire Fabrics Ltd",
    reference: "INV-1001",
    amount: 36_000_000_000n,
    wallet: adire.wallet,
    issuedAt: NOW,
    lines: [{ item: "Ankara (6 yards)", quantity: 2, unitPrice: 18_000_000_000n }],
    ...over,
  };
}

function screen(inv: Invoice, history: PastPayment[] = []) {
  return screenInvoice(inv, { payees: [adire, tailor], history, now: NOW });
}

describe("screenInvoice", () => {
  it("clears a known supplier's invoice at the agreed price", () => {
    const r = screen(invoice());
    expect(r.verdict).toBe("clear");
    expect(r.payee?.id).toBe("p1");
    expect(r.flags).toEqual([]);
  });

  it("matches names regardless of case, spacing and company suffixes", () => {
    expect(screen(invoice({ from: "  adire fabrics limited " })).verdict).toBe("clear");
  });

  it("holds a look-alike of a known supplier's name", () => {
    const r = screen(invoice({ from: "Adlre Fabrics Ltd" }));
    expect(r.verdict).toBe("hold");
    expect(r.flags.map((f) => f.code)).toContain("lookalike");
    expect(r.flags[0]?.reason).toMatch(/Adire Fabrics Ltd/);
  });

  it("holds an invoice from someone Bursr doesn't know", () => {
    const r = screen(invoice({ from: "Brand New Supplies" }));
    expect(r.flags.map((f) => f.code)).toEqual(["unknown_payee"]);
  });

  it("holds a repeat of an invoice already paid (same reference)", () => {
    const r = screen(invoice(), [{ payeeId: "p1", reference: "INV-1001", amount: 36_000_000_000n, paidAt: new Date(NOW.getTime() - 3 * day) }]);
    expect(r.flags.map((f) => f.code)).toContain("duplicate");
  });

  it("holds the same amount to the same supplier within 30 days, even with a new reference", () => {
    const paid = [{ payeeId: "p1", reference: "INV-0999", amount: 36_000_000_000n, paidAt: new Date(NOW.getTime() - 10 * day) }];
    expect(screen(invoice(), paid).flags.map((f) => f.code)).toContain("duplicate");
    const old = [{ ...paid[0]!, paidAt: new Date(NOW.getTime() - 45 * day) }];
    expect(screen(invoice(), old).verdict).toBe("clear");
  });

  it("holds an invoice asking to be paid to a different wallet", () => {
    const r = screen(invoice({ wallet: "0x9999999999999999999999999999999999999999" }));
    expect(r.flags.map((f) => f.code)).toContain("wallet_changed");
  });

  it("holds payments to a wallet that changed in the last 7 days", () => {
    const fresh: Payee = { ...adire, walletSince: new Date(NOW.getTime() - 2 * day) };
    const r = screenInvoice(invoice(), { payees: [fresh], history: [], now: NOW });
    expect(r.flags.map((f) => f.code)).toContain("wallet_changed");
  });

  it("holds a price above the agreed one", () => {
    const r = screen(invoice({ amount: 40_000_000_000n, lines: [{ item: "ankara (6 YARDS)", quantity: 2, unitPrice: 20_000_000_000n }] }));
    expect(r.flags.map((f) => f.code)).toContain("over_price");
  });

  it("holds an invoice whose lines don't add up to its total", () => {
    const r = screen(invoice({ amount: 50_000_000_000n }));
    expect(r.flags.map((f) => f.code)).toContain("total_mismatch");
  });
});
