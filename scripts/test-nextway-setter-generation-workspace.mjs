import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = readFileSync(
  "supabase/migrations/20261111240000_nextway_setter_generation_workspace.sql",
  "utf8",
);

for (const name of [
  "nextway_setter_generation_requests",
  "nextway_begin_setter_generation",
  "nextway_store_setter_generation_output",
  "nextway_get_staged_setter_output",
  "nextway_complete_setter_generation",
]) assert.match(sql, new RegExp(name), `missing AI Setter generation component: ${name}`);

for (const signature of [
  "nextway_begin_setter_generation(uuid,uuid)",
  "nextway_store_setter_generation_output(uuid,jsonb)",
  "nextway_get_staged_setter_output(uuid)",
  "nextway_complete_setter_generation(uuid,text,text,text,text,text)",
]) assert.match(sql, new RegExp(signature.replace(/[()]/g, "\\$&")));

assert.match(sql, /workspace association columns are missing/i);
assert.equal((sql.match(/\$\$/g) || []).length % 2, 0, "SQL dollar-quoted blocks must be balanced");
assert.match(sql, /nextway_has_workspace_access\(/i);
assert.match(sql, /array\['workspace_owner','workspace_admin','workspace_manager','workspace_member'\]/i);
assert.match(sql, /security definer[\s\S]*?set search_path = pg_catalog, public/i);
assert.match(sql, /unique \(owner_profile_id,idempotency_key\)/i);
assert.match(sql, /for update/i);
assert.match(sql, /interval '2 minutes'/i);
assert.match(sql, /returning true into v_inserted/i);
assert.match(sql, /if coalesce\(v_inserted,false\) then[\s\S]*?select true,false,null::jsonb,0/i);
assert.match(sql, /generated_output jsonb/i);
assert.match(sql, /cached_response jsonb/i);
assert.match(sql, /status='completed'/i);
assert.match(sql, /conversation_id,owner_profile_id,direction,content,message_type,ai_generated/i);
assert.match(sql, /'outgoing',[\s\S]*?'text',true/i);
assert.match(sql, /last_message_at=clock_timestamp\(\)/i);
assert.match(sql, /new\.workspace_id is distinct from v_workspace_id/i);
assert.match(sql, /nextway_setter_conversations_workspace_select/i);
assert.match(sql, /nextway_setter_conversations_workspace_manage/i);
assert.match(sql, /nextway_setter_conversations_workspace_scope/i);
assert.match(sql, /nextway_setter_messages_workspace_select/i);
assert.match(sql, /nextway_setter_messages_workspace_manage/i);
assert.match(sql, /nextway_setter_messages_workspace_scope/i);
assert.match(sql, /before insert or update of lead_id, owner_profile_id, workspace_id/i);
assert.match(sql, /revoke all on public\.nextway_setter_generation_requests from public, anon, authenticated/i);
assert.match(sql, /revoke all on function public\.nextway_begin_setter_generation\(uuid,uuid\) from public,anon,service_role/i);
assert.match(sql, /grant execute on function public\.nextway_begin_setter_generation\(uuid,uuid\) to authenticated/i);
const setterRpcGrantLines = sql.split("\n").filter(line =>
  line.startsWith("grant execute on function public.nextway_")
  && line.includes("_setter_generation")
);
assert.equal(setterRpcGrantLines.length, 4);
assert.ok(setterRpcGrantLines.every(line => /to authenticated;$/.test(line)),
  "Setter generation RPCs must be granted only to authenticated users");
assert.doesNotMatch(sql, /alter table public\.nextway_setter_messages\s+add column\s+workspace_id/i,
  "messages must inherit workspace through conversation; do not duplicate workspace_id");
assert.doesNotMatch(sql, /insert into public\.nextway_(leads|setter_conversations)\s*\(/i,
  "migration must not create Lead or conversation records");
assert.doesNotMatch(sql, /update public\.nextway_(leads|setter_messages)\s/i,
  "migration must not backfill or rewrite application records");

console.log("NEXTWAY AI Setter generation workspace SQL contract: PASS");
