import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const edge = readFileSync(
  "supabase/functions/nextway-ai-setter/index.ts",
  "utf8",
);

const upstreamFailure = edge.match(/if \(!aiResponse\.ok\) \{([\s\S]*?)\n      \}/);
assert.ok(upstreamFailure, "OpenAI non-2xx response must have an explicit handler");
const handler = upstreamFailure[1];

assert.match(handler, /await aiResponse\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
assert.match(handler, /upstreamDetails\.code/);
assert.match(handler, /upstreamDetails\.type/);
assert.match(handler, /logSafeFailure\("OpenAI request failed"/);
assert.match(handler, /aiResponse\.status === 429/);
assert.match(handler, /insufficient_quota/);
assert.match(handler, /billing_hard_limit_reached/);
assert.match(handler, /usage_limit_reached/);
assert.match(handler, /quotaExceeded \? 402 : 429/);
assert.match(handler, /Credito API esaurito o limite di spesa raggiunto/);
assert.match(handler, /Limite temporaneo OpenAI raggiunto/);
assert.match(handler, /}, 502, responseOrigin\)/);
assert.doesNotMatch(handler, /console\.error\([^\n]*(?:message|body|payload)/i);
assert.doesNotMatch(handler, /JSON\.stringify\(upstreamPayload\)/);

console.log("NEXTWAY AI Setter upstream error handling contract: PASS");
