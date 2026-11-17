#!/usr/bin/env python3
"""Extract an allowlisted schema-only subset from a plain SQL schema dump."""
from pathlib import Path
import re
import sys

SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/nextway-public-schema.sql")
DEST = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/tmp/nextway-core-ddl-extract.sql")
TABLES = {
    "profiles", "partner_details", "clients", "nextway_leads",
    "nextway_setter_conversations", "nextway_setter_messages",
    "nextway_lead_conversion_requests", "nextway_lead_creation_requests",
    "nextway_lead_audit_logs",
}
FUNCTIONS = {
    "nextway_is_platform_admin", "nextway_capture_lead_audit",
    "nextway_guard_conversion_request_review",
    "nextway_finalize_conversion_activation",
    "nextway_create_lead_conversion_request",
    "nextway_cancel_conversion_activation",
}

def split_sql(sql):
    """Split on semicolons outside SQL strings, comments and dollar bodies."""
    out, buf = [], []
    i, n = 0, len(sql)
    single = double = line_comment = False
    block_depth = 0
    dollar_tag = None
    while i < n:
        if line_comment:
            ch = sql[i]; buf.append(ch); i += 1
            if ch == "\n": line_comment = False
            continue
        if block_depth:
            if sql.startswith("/*", i):
                buf.extend("/*"); block_depth += 1; i += 2
            elif sql.startswith("*/", i):
                buf.extend("*/"); block_depth -= 1; i += 2
            else:
                buf.append(sql[i]); i += 1
            continue
        if dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                buf.extend(dollar_tag); i += len(dollar_tag); dollar_tag = None
            else:
                buf.append(sql[i]); i += 1
            continue
        if single:
            ch = sql[i]; buf.append(ch); i += 1
            if ch == "'" and i < n and sql[i] == "'":
                buf.append(sql[i]); i += 1
            elif ch == "'": single = False
            elif ch == "\\" and i < n:
                buf.append(sql[i]); i += 1
            continue
        if double:
            ch = sql[i]; buf.append(ch); i += 1
            if ch == '"' and i < n and sql[i] == '"':
                buf.append(sql[i]); i += 1
            elif ch == '"': double = False
            continue
        if sql.startswith("--", i):
            buf.extend("--"); i += 2; line_comment = True; continue
        if sql.startswith("/*", i):
            buf.extend("/*"); i += 2; block_depth = 1; continue
        if sql[i] == "'":
            buf.append(sql[i]); i += 1; single = True; continue
        if sql[i] == '"':
            buf.append(sql[i]); i += 1; double = True; continue
        if sql[i] == "$":
            match = re.match(r"\$[A-Za-z_0-9]*\$", sql[i:])
            if match:
                dollar_tag = match.group(0)
                buf.extend(dollar_tag); i += len(dollar_tag); continue
        ch = sql[i]; buf.append(ch); i += 1
        if ch == ";":
            statement = "".join(buf).strip()
            if statement: out.append(statement)
            buf = []
    tail = "".join(buf).strip()
    if tail: out.append(tail)
    return out

def selected(statement):
    # Dump identifiers are quoted; remove identifier quotes for matching.
    s = statement.replace('"', '').strip()
    low = s.lower()
    if re.match(r"^(copy|insert|update|delete|truncate|set|select)\b", low):
        return False
    table_names = "|".join(map(re.escape, sorted(TABLES)))
    function_names = "|".join(map(re.escape, sorted(FUNCTIONS)))
    table_ref = r"(?:only\s+)?public\.(" + table_names + r")\b"
    function_ref = r"public\.(" + function_names + r")\s*\("
    if re.match(r"^create\s+table\s+(?:if\s+not\s+exists\s+)?" + table_ref, low):
        return True
    if re.match(r"^alter\s+table\s+" + table_ref, low):
        return True
    if re.match(r"^create\s+(?:unique\s+)?index\b", low) and re.search(r"\bon\s+" + table_ref, low):
        return True
    if re.match(r"^create\s+(?:or\s+replace\s+)?function\b", low) and re.search(function_ref, low):
        return True
    if re.match(r"^alter\s+function\b", low) and re.search(function_ref, low):
        return True
    if re.match(r"^comment\s+on\s+(?:table|column)\b", low) and re.search(table_ref, low):
        return True
    if re.match(r"^comment\s+on\s+function\b", low) and re.search(function_ref, low):
        return True
    if re.match(r"^create\s+(?:policy|trigger|rule)\b", low) and re.search(r"\bon\s+" + table_ref, low):
        return True
    if re.match(r"^(?:grant|revoke)\b", low) and (
        re.search(r"\bon\s+(?:table\s+)?" + table_ref, low)
        or re.search(r"\bon\s+function\s+" + function_ref, low)
    ):
        return True
    return False

if not SOURCE.is_file():
    raise SystemExit(f"File non trovato: {SOURCE}\nNessun file è stato modificato.")
raw = SOURCE.read_text(encoding="utf-8", errors="replace")
statements = split_sql(raw)
chosen = [statement for statement in statements if selected(statement)]
if not chosen:
    raise SystemExit("Nessun DDL core trovato. Nessun file di output creato.")
header = [
    "-- NEXTWAY CORE DDL EXTRACT",
    "-- Estratto locale da dump SQL testuale; non eseguire direttamente.",
    "-- Solo DDL allowlist per tabelle/funzioni core.",
    "-- Nessuna istruzione COPY/INSERT o riga applicativa selezionata.",
    "-- Snapshot corrente, non baseline storica: confrontare con le migrazioni.",
    "",
]
DEST.write_text("\n\n".join(header + chosen) + "\n", encoding="utf-8")
print(f"ESTRATTO CREATO: {DEST}")
print(f"ISTRUZIONI DDL INCLUSE: {len(chosen)}")
print(f"RIGHE: {len(DEST.read_text(encoding='utf-8').splitlines())}")
print("TABELLE CORE: " + ", ".join(sorted(TABLES)))
print("FUNZIONI CORE: " + ", ".join(sorted(FUNCTIONS)))
print("NESSUNA CONNESSIONE AL DATABASE; NESSUN DATO APPLICATIVO ESPORTATO.")
