// Proves the browser guard port matches the Python guards on every exported case.
// Run: npm run demo:parity   (uses Node's built-in TypeScript type stripping)
import { readFileSync } from "node:fs";
import { checkReply } from "../lib/demo/guards.ts";

const { kb, glossary, cases } = JSON.parse(readFileSync(new URL("./demo-parity.json", import.meta.url), "utf8"));
let failed = 0;
for (const [i, c] of cases.entries()) {
  const got = checkReply(c.reply, c.channel, c.sources, kb, glossary, c.cited_ids, c.source_ko);
  if (JSON.stringify(got) !== JSON.stringify(c.expected)) {
    failed++;
    if (failed <= 5) console.error(`case ${i} differs\n  reply: ${c.reply.slice(0, 80)}\n  python: ${JSON.stringify(c.expected)}\n  ts:     ${JSON.stringify(got)}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} guard cases identical to Python`);
process.exit(failed ? 1 : 0);
