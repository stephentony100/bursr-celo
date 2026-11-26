// Builds and signs one Celo mainnet transaction through Bursr's tagged client,
// then STOPS before it reaches the network: the transport answers reads from
// Celo's public RPC but captures eth_sendRawTransaction instead of sending it.
// It signs with a throwaway key that holds nothing, and prints what would have
// gone out: the target, the decoded call and the decoded attribution tag.
// Nothing is broadcast. Run: pnpm --filter @bursr/chain-celo show-tagged-tx
import { fromDataSuffix } from "@celo/attribution-tags";
import { custom, decodeFunctionData, keccak256, parseAbi, parseTransaction, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { assertTagged, taggedWalletClient } from "../src/tx";

const RPC = "https://forno.celo.org";
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"; // ERC-8004 Identity, Celo mainnet (docs.celo.org …/8004)
const abi = parseAbi(["function register(string agentURI) returns (uint256)"]);

let captured: Hex | null = null;
const transport = custom({
  async request({ method, params }) {
    if (method === "eth_sendRawTransaction") {
      captured = (params as [Hex])[0];
      return keccak256(captured); // pretend; never sent
    }
    const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const json = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result;
  },
});

const account = privateKeyToAccount(generatePrivateKey()); // throwaway, holds nothing
const wallet = taggedWalletClient(account, transport);
await wallet.writeContract({ address: IDENTITY_REGISTRY, abi, functionName: "register", args: ["https://celo.bursr.xyz/.well-known/agent.json"], gas: 300_000n });

if (!captured) throw new Error("Nothing was built.");
const tx = parseTransaction(captured);
const data = tx.data as Hex;
assertTagged(data);
const call = decodeFunctionData({ abi, data });
console.log(JSON.stringify(
  {
    broadcast: false,
    chainId: tx.chainId,
    type: tx.type,
    from: account.address,
    to: tx.to,
    call: { functionName: call.functionName, args: call.args },
    attribution: fromDataSuffix(data),
    calldataEnd: `…${data.slice(-80)}`,
    rawSignedTxBytes: (captured.length - 2) / 2,
  },
  null,
  2,
));
process.exit(0);
