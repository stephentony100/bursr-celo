// Creates the agent's own key once and writes it to the repo's .env.local
// (git-ignored). Prints only the address; the key never leaves the file.
// Refuses to overwrite an existing key. Run: pnpm --filter @bursr/chain-celo new-agent-key
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = resolve(import.meta.dirname, "../../../.env.local");
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const existing = /^AGENT_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m.exec(current);
if (existing) {
  console.log(`An agent key already exists. Agent address: ${privateKeyToAccount(existing[1] as `0x${string}`).address}`);
  process.exit(0);
}
const key = generatePrivateKey();
const rest = current.replace(/^AGENT_PRIVATE_KEY=.*$/m, "").trimEnd();
writeFileSync(file, `${rest ? `${rest}\n` : ""}AGENT_PRIVATE_KEY=${key}\n`, { mode: 0o600 });
console.log(`New agent key saved to .env.local. Agent address: ${privateKeyToAccount(key).address}`);
