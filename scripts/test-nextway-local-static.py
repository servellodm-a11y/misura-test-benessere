#!/usr/bin/env python3
"""Python 3.9-compatible local mirror of the NEXTWAY static regression checks.

Run from the repository root:
    python3 scripts/test-nextway-local-static.py

This script reads source files only. It does not contact Supabase, write data,
send email, deploy functions, or modify repository files.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def read(relative_path):
    path = ROOT / relative_path
    if not path.is_file():
        raise AssertionError("File mancante: " + relative_path)
    return path.read_text(encoding="utf-8")


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def contains(source, fragment, message):
    require(fragment in source, message)


def matches(source, pattern, message, flags=0):
    require(re.search(pattern, source, flags) is not None, message)


def excludes(source, pattern, message, flags=0):
    require(re.search(pattern, source, flags) is None, message)


def test_local_cors():
    paths = [
        "supabase/functions/nextway-workspace-admin/index.ts",
        "supabase/functions/nextway-ai-setter/index.ts",
        "supabase/functions/nextway-search/index.ts",
        "supabase/functions/nextway-knowledge-ingest/index.ts",
        "supabase/functions/nextway-knowledge-upload/index.ts",
        "supabase/functions/nextway-conversion-provisioning/index.ts",
    ]
    for path in paths:
        source = read(path)
        contains(source, '"http://localhost:8000"', path + ": origine localhost assente")
        matches(source, r"\.\.\.configuredOrigins", path + ": origini configurate non preservate")
        matches(source, r"allowedOrigins\.includes\(origin\)", path + ": controllo allow-list assente")
        contains(source, "Access-Control-Allow-Origin", path + ": header CORS assente")
        contains(source, 'req.method === "OPTIONS"', path + ": gestione preflight OPTIONS assente")
        excludes(source, r'Access-Control-Allow-Origin["\']?\s*:\s*["\']\*["\']',
                 path + ": CORS wildcard non consentito")
    print("NEXTWAY local CORS: 6 Edge Functions e allow-list senza wildcard: PASS")


def test_workspace_admin_security():
    edge = read("supabase/functions/nextway-workspace-admin/index.ts")
    sql = read("supabase/migrations/20261111200000_nextway_workspace_activation_rpc.sql")

    contains(edge, '"http://localhost:8000"', "Origine locale non autorizzata")
    matches(edge, r"\.\.\.configuredOrigins", "Origini configurate non preservate")
    matches(edge, r'req\.method === "OPTIONS"[\s\S]*?respond\(\{\}, 200, origin\)',
            "Preflight OPTIONS non risponde con CORS")
    contains(edge, "Access-Control-Allow-Origin", "Header CORS allow-origin assente")
    matches(edge, r"allowedOrigins\.includes\(origin\)", "Controllo allow-list assente")

    matches(edge, r"Deno\.serve\(async \(req\)", "Handler Edge Function assente")
    matches(edge, r"auth\.getUser\(token\)", "Verifica token autenticazione assente")
    matches(edge, r"profile\?\.role !== \"platform_admin\"", "Gate platform_admin assente")
    contains(edge, "NEXTWAY_SERVICE_ROLE_KEY", "Configurazione server-side admin assente")
    contains(edge, "MAX_BODY_BYTES = 100_000", "Limite dimensione body assente")

    actions = [
        "list_workspaces", "list_profiles", "list_memberships", "set_membership",
        "list_documents", "approve_document", "reject_document", "list_prompts",
        "list_criteria", "create_workspace", "update_workspace", "save_prompt_draft",
        "save_criteria_draft", "activate_prompt", "activate_criteria", "archive_prompt",
        "archive_criteria",
    ]
    for action in actions:
        contains(edge, action, "Azione amministrativa mancante: " + action)

    contains(edge, "nextway_activate_workspace_prompt", "RPC attivazione prompt assente")
    contains(edge, "nextway_activate_workspace_criteria", "RPC attivazione criteri assente")
    contains(edge, "nextway_workspace_memberships", "Tabella membership non referenziata")
    contains(edge, 'action === "list_profiles"', "Elenco profili assente")
    contains(edge, 'select("id,role,full_name")', "Proiezione profili non minima")
    contains(edge, 'select("profile_id,first_name,last_name")', "Lookup nomi partner assente")
    excludes(edge, r'select\([^\n]*email[^\n]*\)', "La directory admin non deve esporre email", re.I)

    contains(edge, "auth.admin.getUserById(body.user_id)", "Verifica utente Auth assente")
    contains(edge, 'onConflict: "workspace_id,user_id"', "Upsert membership non idempotente")
    contains(edge, 'membership_status === "active"', "Controllo stato membership assente")
    contains(edge, 'workspace.status !== "active"', "Controllo workspace attivo assente")
    matches(edge, r"workspace_owner[\s\S]*?workspace_admin[\s\S]*?workspace_manager[\s\S]*?workspace_member[\s\S]*?workspace_viewer",
            "Allow-list ruoli workspace incompleta")
    matches(edge, r"invited[\s\S]*?active[\s\S]*?suspended", "Allow-list stati membership incompleta")
    contains(edge, "Esiste già un owner attivo o invitato", "Protezione owner duplicato assente")
    contains(edge, "nextway_knowledge_documents", "Gestione documenti KB assente")
    contains(edge, 'approval_status: "approved"', "Stato approvazione assente")
    contains(edge, 'approval_status: "rejected"', "Stato rifiuto assente")
    contains(edge, "approved_by: authData.user.id", "Tracciamento approvatore assente")
    contains(edge, "validText(body.reason, 5, 1000)", "Validazione motivazione rifiuto assente")
    matches(edge, r'\.eq\("approval_status", "pending"\)', "Aggiornamento documento non limitato a pending")

    contains(edge, 'status: "draft"', "Nuove versioni non forzate in bozza")
    contains(edge, "approved_by", "Campo approvatore non gestito")
    excludes(edge, r"console\.(log|error)\([^\n]*(token|serviceKey|prompt_body)",
             "Possibile log di dati sensibili", re.I)

    for function_name in ("nextway_activate_workspace_prompt", "nextway_activate_workspace_criteria"):
        matches(sql, r"create or replace function public\." + function_name + r"\(",
                "RPC SQL mancante: " + function_name)
    require(len(re.findall(r"security definer", sql, re.I)) == 2,
            "Le due RPC devono usare SECURITY DEFINER")
    require(len(re.findall(r"set search_path = pg_catalog, public", sql, re.I)) == 2,
            "Le due RPC devono fissare search_path")
    require(len(re.findall(r"p\.role = 'platform_admin'", sql, re.I)) == 2,
            "Le due RPC devono verificare platform_admin")
    matches(sql, r"for update", "Lock transazionale assente")
    matches(sql, r"set status = 'archived'", "Archiviazione versione precedente assente", re.I)
    matches(sql, r"set status = 'active', approved_by = p_admin_user_id",
            "Attivazione versione e approvatore non atomica", re.I)
    for function_name in ("nextway_activate_workspace_prompt", "nextway_activate_workspace_criteria"):
        matches(sql, r"revoke all on function public\." + function_name +
                r"\(uuid, uuid\) from public, anon, authenticated",
                "REVOKE RPC non conforme: " + function_name, re.I)
        matches(sql, r"grant execute on function public\." + function_name +
                r"\(uuid, uuid\) to service_role",
                "GRANT service_role assente: " + function_name, re.I)
    excludes(sql, r"grant execute[^;]*authenticated", "Le RPC non devono concedere execute ad authenticated", re.I)

    print("NEXTWAY workspace admin: API autenticata, membership, KB, RPC e ACL: PASS")


def test_admin_ui():
    html = read("nextway-admin.html")
    js = read("nextway-admin.js")
    edge = read("supabase/functions/nextway-workspace-admin/index.ts")

    contains(html, "La creazione registra un nuovo workspace nel database",
             "Avviso scrittura workspace assente")
    matches(html, r'name="name" required maxlength="160" placeholder="Es\. Azienda partner Italia"',
            "Campo nome workspace non conforme")
    matches(html, r'name="workspace_key" required maxlength="80" pattern="\[a-z0-9\]\[a-z0-9_-\]\{1,79\}" placeholder="Es\. azienda-partner-italia"',
            "Campo chiave workspace non conforme")
    matches(html, r'name="market_country" maxlength="120" placeholder="Es\. Italia"',
            "Campo paese workspace non conforme")
    excludes(html, r'name="(?:name|workspace_key|market_country)"[^>]*\bvalue=',
             "I campi workspace non devono essere precompilati")

    for required in [
        "nextway-cloud.js", "nextway-admin.js", "selected-workspace",
        "workspace-create", "membership-save", "knowledge-upload",
        "documents-refresh", "knowledge-search", "prompt-create",
        "criteria-create", "prompt-list", "criteria-list", "governance-refresh",
    ]:
        contains(html, required, "Elemento UI mancante: " + required)

    actions = [
        "list_workspaces", "create_workspace", "update_workspace", "list_profiles",
        "list_memberships", "set_membership", "list_documents", "approve_document",
        "reject_document", "list_prompts", "list_criteria", "save_prompt_draft",
        "save_criteria_draft", "activate_prompt", "activate_criteria", "archive_prompt",
        "archive_criteria",
    ]
    for action in actions:
        contains(js, '"' + action + '"', "Azione UI mancante: " + action)
        contains(edge, 'action === "' + action + '"', "Azione API mancante: " + action)

    contains(js, "/functions/v1/nextway-workspace-admin", "Endpoint workspace-admin assente")
    contains(js, "/functions/v1/nextway-knowledge-upload", "Endpoint upload KB assente")
    contains(js, 'rpc("nextway_search_knowledge"', "RPC ricerca KB assente")
    contains(js, "JSON.parse(values.config", "Parsing configurazione criteri assente")
    contains(js, "renderGovernanceItems", "Rendering governance assente")
    contains(js, 'status === "draft"', "Gestione stato draft assente")
    contains(js, "textContent", "Rendering testuale sicuro assente")
    excludes(js, r"\.innerHTML\s*=", "Rendering dinamico tramite innerHTML non consentito")
    excludes(js, r"service[_-]?role|SUPABASE_SERVICE_ROLE_KEY",
             "Credenziali service-role non devono comparire nel browser", re.I)
    contains(js, "Nessuna email o invito è stato inviato", "Messaggio membership senza invio email assente")
    contains(edge, 'profile?.role !== "platform_admin"', "Gate server-side admin assente")
    contains(edge, "auth.admin.getUserById(body.user_id)", "Verifica account Auth assente")
    contains(edge, 'approval_status: "approved"', "Approvazione documento assente")
    contains(edge, 'approval_status: "rejected"', "Rifiuto documento assente")

    print("NEXTWAY platform admin UI: workspace, membership, KB, rendering sicuro e gate admin: PASS")



def test_conversion_integrity():
    edge = read("supabase/functions/nextway-conversion-provisioning/index.ts")
    migration = read("supabase/migrations/20261112170000_nextway_conversion_activation_integrity.sql")

    contains(edge, "function safeErrorCode(error: unknown)",
             "Sanitizzazione codice errore provisioning assente")
    excludes(edge, r"safeMessage\(error\)|error\.message|deleteError\.message",
             "I dettagli grezzi delle eccezioni non devono essere esposti o registrati")
    contains(edge, "Operazione di provisioning non completata",
             "Messaggio generico di errore provisioning assente")
    contains(edge, "request_id: requestId",
             "Identificativo correlazione richiesta assente")

    matches(migration, r"from public\.nextway_leads l[\s\S]*?for update",
            "Lock pessimista del Lead assente")
    matches(migration, r"l\.owner_profile_id = r\.owner_profile_id[\s\S]*?l\.status = 'In valutazione'[\s\S]*?l\.archived_at is null",
            "Verifica stato/owner/archivio del Lead assente")
    matches(migration, r"update public\.nextway_leads[\s\S]*?returning id into v_lead_id[\s\S]*?if v_lead_id is null then[\s\S]*?raise exception",
            "La transizione Lead deve essere verificata e atomica")
    update_position = migration.index("update public.nextway_leads")
    partner_position = migration.index("insert into public.partner_details")
    client_position = migration.index("insert into public.clients")
    require(update_position < partner_position and update_position < client_position,
            "I record cliente/partner devono essere creati solo dopo la transizione Lead")
    matches(migration, r"begin;[\s\S]*?commit;", "Migrazione conversione non transazionale")
    matches(migration, r"grant execute on function public\.nextway_finalize_conversion_activation\(uuid, uuid, uuid\)\s+to service_role",
            "Grant service_role per finalizzazione assente")
    excludes(migration, r"grant execute[^;]*authenticated",
             "La finalizzazione non deve concedere execute ad authenticated", re.I)

    print("NEXTWAY conversion integrity: lock Lead, transizione atomica e gestione errori: PASS")


def main():
    try:
        test_local_cors()
        test_workspace_admin_security()
        test_admin_ui()
        test_conversion_integrity()
    except (AssertionError, OSError, UnicodeError) as error:
        print("NEXTWAY LOCAL STATIC: FAIL — " + str(error), file=sys.stderr)
        return 1
    print("NEXTWAY LOCAL STATIC: tutti e quattro i gruppi di controlli superati.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
