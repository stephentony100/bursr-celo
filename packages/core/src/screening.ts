// Invoice screening: before Bursr pays a supplier, it checks the invoice for
// the four tricks that cost small businesses money. Anything flagged is held
// for the owner; only a clean invoice goes ahead. Pure functions: no chain,
// no network, no AI. Amounts are integers in the payout token's own units.

export type Address = `0x${string}`;

export interface AgreedPrice {
  item: string;
  unitPrice: bigint;
}

export interface Payee {
  id: string;
  name: string;
  kind: "staff" | "supplier";
  wallet: Address;
  /** When `wallet` was set: a payout wallet that changed recently is held. */
  walletSince: Date;
  agreedPrices: AgreedPrice[];
}

export interface InvoiceLine {
  item: string;
  quantity: number;
  unitPrice: bigint;
}

export interface Invoice {
  id: string;
  /** The name the invoice is from, as written on it. */
  from: string;
  reference: string;
  amount: bigint;
  /** The wallet the invoice asks to be paid to. */
  wallet: Address;
  issuedAt: Date;
  lines: InvoiceLine[];
}

export interface PastPayment {
  payeeId: string;
  reference: string;
  amount: bigint;
  paidAt: Date;
}

export type FlagCode = "unknown_payee" | "lookalike" | "duplicate" | "wallet_changed" | "over_price" | "total_mismatch";

export interface Flag {
  code: FlagCode;
  /** Plain words for the owner. */
  reason: string;
}

export interface Screening {
  verdict: "clear" | "hold";
  flags: Flag[];
  /** The known payee the invoice is from, when its name matches one exactly. */
  payee?: Payee;
}

export interface ScreeningContext {
  payees: Payee[];
  history: PastPayment[];
  now: Date;
  /** Same amount to the same payee inside this window looks like a repeat (default 30 days). */
  duplicateWindowDays?: number;
  /** A payout wallet set this recently is held (default 7 days). */
  newWalletHoldDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SUFFIXES = new Set(["ltd", "limited", "plc", "inc", "co", "company", "enterprise", "enterprises", "ventures", "nig", "nigeria", "global", "intl", "international"]);

/** A name reduced to what matters: lower case, letters and digits, no company suffixes. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w))
    .join(" ");
}

function normalizeItem(item: string): string {
  return item.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Edit distance (insertions, deletions, substitutions). */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Close to a known name but not it: one or two characters off, or 85% alike for long names. */
function looksLike(a: string, b: string): boolean {
  if (a === b || a.length < 4 || b.length < 4) return false;
  const d = editDistance(a, b);
  return d <= 2 || 1 - d / Math.max(a.length, b.length) >= 0.85;
}

export function screenInvoice(inv: Invoice, ctx: ScreeningContext): Screening {
  const flags: Flag[] = [];
  const name = normalizeName(inv.from);
  const payee = ctx.payees.find((p) => normalizeName(p.name) === name);

  if (!payee) {
    const lookalike = ctx.payees.find((p) => looksLike(normalizeName(p.name), name));
    flags.push(
      lookalike
        ? { code: "lookalike", reason: `"${inv.from}" looks like ${lookalike.name}, but isn't the same name. It could be someone pretending to be them.` }
        : { code: "unknown_payee", reason: `"${inv.from}" isn't one of the people you pay. Add them first if this is real.` },
    );
    return { verdict: "hold", flags };
  }

  const windowMs = (ctx.duplicateWindowDays ?? 30) * DAY_MS;
  const repeat = ctx.history.find(
    (h) => h.payeeId === payee.id && (h.reference.trim().toLowerCase() === inv.reference.trim().toLowerCase() || (h.amount === inv.amount && ctx.now.getTime() - h.paidAt.getTime() <= windowMs)),
  );
  if (repeat) {
    flags.push({
      code: "duplicate",
      reason: repeat.reference.trim().toLowerCase() === inv.reference.trim().toLowerCase() ? `Invoice ${inv.reference} was already paid.` : `You paid ${payee.name} this same amount recently (${repeat.reference}). This may be a repeat.`,
    });
  }

  if (inv.wallet.toLowerCase() !== payee.wallet.toLowerCase()) {
    flags.push({ code: "wallet_changed", reason: `This invoice asks to be paid to a different wallet than the one you have for ${payee.name}. Check with them by phone first.` });
  } else if (ctx.now.getTime() - payee.walletSince.getTime() < (ctx.newWalletHoldDays ?? 7) * DAY_MS) {
    flags.push({ code: "wallet_changed", reason: `${payee.name}'s payout wallet changed in the last few days. The first payment to it waits for your OK.` });
  }

  for (const line of inv.lines) {
    const agreed = payee.agreedPrices.find((a) => normalizeItem(a.item) === normalizeItem(line.item));
    if (agreed && line.unitPrice > agreed.unitPrice) {
      flags.push({ code: "over_price", reason: `${line.item} is charged above the price you agreed with ${payee.name}.` });
    }
  }

  if (inv.lines.length > 0) {
    const sum = inv.lines.reduce((acc, l) => acc + l.unitPrice * BigInt(l.quantity), 0n);
    if (sum !== inv.amount) flags.push({ code: "total_mismatch", reason: "The invoice total doesn't match its lines." });
  }

  return { verdict: flags.length ? "hold" : "clear", flags, payee };
}
