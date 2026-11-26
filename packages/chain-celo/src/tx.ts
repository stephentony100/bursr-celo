import { fromDataSuffix, toDataSuffix, withAttribution } from "@celo/attribution-tags";
import { concat, createWalletClient, http, type Account, type Hex, type Transport } from "viem";
import { celo } from "viem/chains";

// Every transaction Bursr sends on Celo carries Bursr's hackathon attribution
// tag: an ERC-8021 suffix appended to the calldata ("The suffix is invisible
// to the contract being called (the EVM discards trailing bytes)",
// celo-org/attribution-tags). It must be there from the very first mainnet
// transaction, so it lives here, in the one client every package sends
// through, and sending checks for it.

/** Bursr's assigned code for the Celo "Agents Open for Business" hackathon. Public: it is visible in every tagged transaction. */
export const ATTRIBUTION_CODE = "celo_b9a8cee0812d";

const SUFFIX = toDataSuffix(ATTRIBUTION_CODE) as Hex;

/** Does this calldata end with a tag that includes Bursr's code? */
export function isTagged(data: Hex): boolean {
  const decoded = fromDataSuffix(data);
  return Boolean(decoded?.codes.includes(ATTRIBUTION_CODE));
}

/** Appends Bursr's tag to calldata (for calls built elsewhere, such as Textile's `transactions.swap.data`). Tags once. */
export function tagCalldata(data: Hex): Hex {
  return isTagged(data) ? data : concat([data, SUFFIX]);
}

/** Throws unless the calldata carries Bursr's tag: nothing untagged leaves Bursr. */
export function assertTagged(data: Hex): void {
  if (!isTagged(data)) throw new Error(`Refusing to send: the transaction is missing Bursr's attribution tag (${ATTRIBUTION_CODE}).`);
}

/**
 * The wallet client for transactions Bursr signs itself (the agent's own
 * account): viem's `sendTransaction` and `writeContract` tagged by
 * `withAttribution`. `transport` defaults to Celo mainnet RPC.
 */
export function taggedWalletClient(account: Account, transport: Transport = http()) {
  return createWalletClient({ account, chain: celo, transport }).extend(withAttribution(ATTRIBUTION_CODE));
}
