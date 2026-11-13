#!/usr/bin/env python3
"""Inventario statico e confronto sicuro della baseline NEXTWAY.

Legge il dump schema-only in /tmp e le migrazioni del repository.
Non stampa corpi SQL, valori, email, token o definizioni di funzione.
Non esegue SQL e non si connette a Supabase.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path
from typing import Dict, Iterable, Set

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DUMP = Path("/tmp/nextway-public-schema.sql")

PATTERNS = {
    "tables": re.compile(r'\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"public"|public)\s*\.\s*)?"?([A-Za-z_][\w$]*)"?', re.I),
    "functions": re.compile(r'\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(?:"public"|public)\s*\.\s*)?"?([A-Za-z_][\w$]*)"?', re.I),
    "views": re.compile(r'\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:(?:"public"|public)\s*\.\s*)?"?([A-Za-z_][\w$]*)"?', re.I),
    "types": re.compile(r'\bCREATE\s+TYPE\s+(?:(?:"public"|public)\s*\.\s*)?"?([A-Za-z_][\w$]*)"?', re.I),
    "sequences": re.compile(r'\bCREATE\s+SEQUENCE\s+(?:(?:"public"|public)\s*\.\s*)?"?([A-Za-z_][\w$]*)"?', re.I),
    "triggers": re.compile(r'\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+"?([A-Za-z_][\w$]*)"?', re.I),
    "policies": re.compile(r'\bCREATE\s+POLICY\s+"?([A-Za-z_][\w$]*)"?', re.I),
    "indexes": re.compile(r'\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][\w$]*)"?', re.I),
}

MANAGED_REF = re.compile(r'\b(auth|storage|extensions|vault|net)\.([A-Za-z_][\w$]*)', re.I)
MIGRATION_FILES = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))


def names(sql: str, pattern: re.Pattern[str]) -> Set[str]:
    return {m.group(1).lower() for m in pattern.finditer(sql)}


def inventory(sql: str) -> Dict[str, Set[str]]:
    return {kind: names(sql, pattern) for kind, pattern in PATTERNS.items()}


def fmt(values: Iterable[str]) -> str:
    vals = sorted(values)
    return ", ".join(vals) if vals else "(nessuno)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump", type=Path, default=DEFAULT_DUMP,
                        help="percorso del dump schema-only (default: /tmp/nextway-public-schema.sql)")
    args = parser.parse_args()

    if not args.dump.is_file():
        print(f"ERRORE: dump non trovato: {args.dump}", file=sys.stderr)
        return 2
    if not MIGRATION_FILES:
        print("ERRORE: nessuna migrazione trovata in supabase/migrations/", file=sys.stderr)
        return 2

    dump = args.dump.read_text(encoding="utf-8", errors="replace")
    migration_sql = []
    for path in MIGRATION_FILES:
        migration_sql.append((path.name, path.read_text(encoding="utf-8", errors="replace")))

    # Il confronto è intenzionalmente limitato alle dichiarazioni riconoscibili
    # nello schema public; non interpreta SQL dinamico o corpi PL/pgSQL.
    base = inventory(dump)
    declared: Dict[str, Set[str]] = {kind: set() for kind in PATTERNS}
    managed_refs: Set[str] = set()
    migration_security_definer = 0
    migration_search_path = 0

    for _, sql in migration_sql:
        found = inventory(sql)
        for kind, values in found.items():
            declared[kind].update(values)
        managed_refs.update(f"{m.group(1).lower()}.{m.group(2).lower()}"
                            for m in MANAGED_REF.finditer(sql))
        migration_security_definer += len(re.findall(r'\bSECURITY\s+DEFINER\b', sql, re.I))
        migration_search_path += len(re.findall(r'\bSET\s+search_path\b', sql, re.I))

    digest = hashlib.sha256(args.dump.read_bytes()).hexdigest()
    print("NEXTWAY — confronto statico baseline / migrazioni")
    print(f"Dump: {args.dump}")
    print(f"SHA-256: {digest}")
    print(f"Migrazioni lette: {len(migration_sql)}")
    print("Nota: analisi lessicale; non è un parser PostgreSQL e non certifica importabilità.\n")

    for kind in PATTERNS:
        present = declared[kind] & base[kind]
        absent = declared[kind] - base[kind]
        print(f"[{kind}] baseline={len(base[kind])} | dichiarate_migrazioni={len(declared[kind])} | presenti={len(present)} | non_trovate={len(absent)}")
        if present:
            print(f"  presenti: {fmt(present)}")
        if absent:
            print(f"  non trovate nel dump: {fmt(absent)}")

    print("\n[Dipendenze managed rilevate nelle migrazioni]")
    print(fmt(managed_refs))
    print("\n[Controlli lessicali sulle migrazioni]")
    print(f"SECURITY DEFINER: {migration_security_definer}")
    print(f"SET search_path: {migration_search_path}")
    policy_count = sum(len(re.findall(r"\bCREATE\s+POLICY\b", sql, re.I)) for _, sql in migration_sql)
    trigger_count = sum(len(re.findall(r"\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b", sql, re.I)) for _, sql in migration_sql)
    print(f"Policy RLS dichiarate: {policy_count}")
    print(f"Trigger dichiarati: {trigger_count}")
    print("\nATTENZIONE: un oggetto non trovato può essere creato da una migrazione successiva o usare SQL dinamico.")
    print("Prima dell'import verificare manualmente prerequisiti, FK, ownership, grant, ruoli e schemi managed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
