import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20261116100000_nextway_prospect_identity_memory.sql", "utf8");

// PR #12 prepares the schema only. The dependent PR #13 supplies the Edge
// Function integration and replaces this guard with its full contract suite.
if (!migration.includes("nextway_merge_prospect_identity")) {
  assert.match(migration, /nextway_store_search_query_cache/,
    "the schema-only PR must provide the validated cache persistence RPC");
  console.log("NEXTWAY central integration contract: deferred to dependent PR #13.");
  process.exit(0);
}

assert.match(migration, /nextway_lookup_prospect_crm_matches/,
  "CRM duplicate lookup RPC must be present when the integration is included");
console.log("NEXTWAY central integration contract: integrated migration detected.");
