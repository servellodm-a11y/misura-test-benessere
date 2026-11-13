#!/usr/bin/env python3
"""Rileva COPY/INSERT solo come statement SQL di primo livello in un dump plain SQL.

Ignora stringhe, identificatori quotati, commenti e corpi dollar-quoted
(come i corpi delle funzioni PL/pgSQL). Non stampa mai il contenuto SQL.
"""
import re
import sys
from pathlib import Path

DANGEROUS = re.compile(r"^\s*(COPY\b|INSERT\s+INTO\b)", re.IGNORECASE)
DOLLAR_TAG = re.compile(r"\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$")


def scan_sql(source):
    found = []
    statement = []
    statement_line = None
    line = 1
    i = 0
    n = len(source)
    state = "normal"
    block_depth = 0
    dollar_end = None

    def add_visible(ch, current_line):
        nonlocal statement_line
        if statement_line is None and not ch.isspace():
            statement_line = current_line
        statement.append(ch)

    def finish_statement():
        nonlocal statement, statement_line
        candidate = "".join(statement)
        match = DANGEROUS.match(candidate)
        if match:
            kind = "COPY" if match.group(1).upper() == "COPY" else "INSERT INTO"
            found.append((statement_line or 1, kind))
        statement = []
        statement_line = None

    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""

        if state == "normal":
            if ch == "-" and nxt == "-":
                state = "line_comment"
                statement.append(" ")
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = "block_comment"
                block_depth = 1
                statement.append(" ")
                i += 2
                continue
            if ch == "'":
                add_visible(" ", line)
                state = "single_quote"
                i += 1
                continue
            if ch == '"':
                add_visible(" ", line)
                state = "double_quote"
                i += 1
                continue
            if ch == "$":
                m = DOLLAR_TAG.match(source, i)
                if m:
                    add_visible(" ", line)
                    dollar_end = m.group(0)
                    state = "dollar_quote"
                    i = m.end()
                    continue
            if ch == ";":
                finish_statement()
                i += 1
                continue
            add_visible(ch, line)
            if ch == "\n":
                line += 1
            i += 1
            continue

        if state == "line_comment":
            if ch == "\n":
                statement.append("\n")
                line += 1
                state = "normal"
            i += 1
            continue

        if state == "block_comment":
            if ch == "/" and nxt == "*":
                block_depth += 1
                i += 2
            elif ch == "*" and nxt == "/":
                block_depth -= 1
                i += 2
                if block_depth == 0:
                    state = "normal"
            else:
                if ch == "\n":
                    statement.append("\n")
                    line += 1
                i += 1
            continue

        if state in ("single_quote", "double_quote"):
            quote = "'" if state == "single_quote" else '"'
            if ch == "\\" and state == "single_quote" and i + 1 < n:
                if nxt == "\n":
                    line += 1
                i += 2
            elif ch == quote and nxt == quote:
                i += 2
            elif ch == quote:
                state = "normal"
                i += 1
            else:
                if ch == "\n":
                    line += 1
                i += 1
            continue

        if state == "dollar_quote":
            if source.startswith(dollar_end, i):
                i += len(dollar_end)
                dollar_end = None
                state = "normal"
            else:
                if ch == "\n":
                    line += 1
                i += 1
            continue

    if state in ("single_quote", "double_quote", "dollar_quote", "block_comment"):
        raise ValueError("dump SQL incompleto: delimitatore non chiuso")

    finish_statement()
    return found


def self_test():
    fixture = """-- INSERT INTO commento
CREATE FUNCTION f() RETURNS void AS $body$
BEGIN
  INSERT INTO public.tabella VALUES (1);
END;
$body$ LANGUAGE plpgsql;
/* COPY f FROM stdin; */
SET search_path = public;
INSERT INTO public.tabella VALUES (2);
COPY public.altra FROM stdin;
"""
    result = scan_sql(fixture)
    expected = [(9, "INSERT INTO"), (10, "COPY")]
    if result != expected:
        print("SELF_TEST_FAIL")
        print("Risultato inatteso nel test interno.")
        return 1
    print("SELF_TEST_OK")
    return 0


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return self_test()
    if len(sys.argv) != 2:
        print("Uso: check-nextway-schema-dump.py <dump.sql>", file=sys.stderr)
        return 2
    try:
        findings = scan_sql(Path(sys.argv[1]).read_text(encoding="utf-8", errors="strict"))
    except (OSError, UnicodeError, ValueError):
        print("SCANNER_ERROR | impossibile completare l'analisi lessicale del dump")
        return 2
    print("DATA_STATEMENTS={}".format(len(findings)))
    for number, kind in findings:
        print("RIGA {} — {}".format(number, kind))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
