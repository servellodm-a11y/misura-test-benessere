#!/usr/bin/env python3
"""Extract a small, schema-only subset from a plain-text pg_dump file.

No database connection is made. The script never reads table data from COPY
sections and never exports auth.users, storage.objects, secrets, or app rows.
"""
from pathlib import Path
import re
import sys

SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/nextway-public-schema.sql")
DEST = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/tmp/nextway-core-ddl-extract.sql")

TABLES = {
    "profiles",
    "partner_details",
    "clients",
    "nextway_leads",
    "nextway_setter_conversations",
    "nextway_setter_messages",
    "nextway_lead_conversion_requests",
    "nextway_lead_creation_requests",
    "nextway_lead_audit_logs",
}
FUNCTIONS = {
    "nextway_is_platform_admin",
    "nextway_capture_lead_audit",
    "nextway_guard_conversion_request_review",
    "nextway_finalize_conversion_activation",
    "nextway_create_lead_conversion_request",
    "nextway_cancel_conversion_activation",
}

if not SOURCE.is_file():
    raise SystemExit(
        f"File non trovato: {SOURCE}\n"
        "Controlla che il dump esista e riprova indicando il percorso corretto."
    )

raw = SOURCE.read_text(encoding="utf-8", errors="replace")
marker_re = re.compile(r"(?m)^-- Name: .*?; Type: .*?$")
matches = list(marker_re.finditer(raw))
if not matches:
    raise SystemExit(
        "Formato non riconosciuto: serve un dump pg_dump in formato testo/SQL, "
        "non un file custom (.dump/.backup). Nessun file è stato modificato."
    )

sections = []
for i, match in enumerate(matches):
    end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
    section = raw[match.start():end].strip()
    marker = section.splitlines()[0]
    sections.append((marker, section))

def selected(marker: str, section: str) -> bool:
    # Hard exclusion: pg_dump data sections must never enter the extract.
    if re.search(r"; Type: [^;]*\\bDATA\\b", marker, re.IGNORECASE):
        return False
    if re.search(r"(?m)^COPY\\s", section, re.IGNORECASE):
        return False

    # Keep only objects explicitly in public schema; do not include auth/storage.
    if "Schema: public;" not in marker and "Type: ACL;" not in marker:
        return False

    marker_lower = marker.lower()
    body_lower = section.lower()

    # Explicit allowlist of function definitions, not arbitrary functions.
    if "type: function;" in marker_lower:
        return any(re.search(rf"\b{re.escape(name)}\s*\(", body_lower)
                   for name in FUNCTIONS)

    # Table definitions and all related DDL (constraints, indexes, policies,
    # triggers, comments, grants/revokes) that reference one of the core tables.
    for table in TABLES:
        if re.search(rf"\bpublic\.{re.escape(table)}\b", body_lower):
            return True
        # Some pg_dump object markers identify constraints by their parent table.
        if table in marker_lower and any(
            kind in marker_lower for kind in
            ("type: table;", "type: constraint;", "type: index;",
             "type: trigger;", "type: policy;", "type: rule;",
             "type: row security;", "type: default;", "type: comment;")
        ):
            return True
    return False

chosen = [(m, s) for m, s in sections if selected(m, s)]
if not chosen:
    raise SystemExit(
        "Nessuna definizione corrispondente trovata. "
        "Il dump potrebbe non essere uno schema public in formato pg_dump testo."
    )

header = [
    "-- NEXTWAY CORE DDL EXTRACT",
    "-- Generated locally from an existing plain-text pg_dump.",
    "-- Schema definitions only: no COPY/INSERT data sections are selected.",
    "-- Review against migrations; this is a current snapshot, not a baseline.",
    "",
]
DEST.write_text("\n\n".join(header + [s for _, s in chosen]) + "\n",
                encoding="utf-8")

print(f"ESTRATTO CREATO: {DEST}")
print(f"SEZIONI DDL INCLUSE: {len(chosen)}")
print(f"RIGHE: {len(DEST.read_text(encoding='utf-8').splitlines())}")
print("TABELLE CORE RICERCATE: " + ", ".join(sorted(TABLES)))
print("FUNZIONI INCLUSE: " + ", ".join(sorted(FUNCTIONS)))
print("NESSUNA CONNESSIONE AL DATABASE; NESSUN DATO DI TABELLA ESPORTATO.")
