#!/usr/bin/env bash
# NEXTWAY local preflight: sola lettura, nessuna connessione remota e nessuna modifica.
# Non esegue supabase init/start/link/db pull/db push/migration/deploy.
set -u

EXPECTED_DUMP_SHA="5622e4e5864c6860241f04ad6ecff6c08a1d7a61c37a062b50772fa704a9f32d"
DUMP_PATH="/tmp/nextway-public-schema.sql"
EXPECTED_CLI="3.1.0"

ok=0
warn=0
fail=0

pass() { printf 'OK | %s\n' "$1"; ok=$((ok + 1)); }
note() { printf 'ATTENZIONE | %s\n' "$1"; warn=$((warn + 1)); }
stop() { printf 'BLOCCO | %s\n' "$1"; fail=$((fail + 1)); }

printf '%s\n' "NEXTWAY — PRE-FLIGHT LOCALE (sola lettura)"
printf '%s\n' "Nessun comando remoto, migrazione, avvio container o modifica verrà eseguito."
printf '\n'

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
printf 'Repository: %s\n' "$ROOT"
BRANCH="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
printf 'Branch locale: %s\n' "${BRANCH:-non rilevato}"

if command -v supabase >/dev/null 2>&1; then
  CLI="$(supabase --version 2>/dev/null | head -n 1)"
  printf 'Supabase CLI: %s\n' "$CLI"
  case "$CLI" in
    *"$EXPECTED_CLI"*) pass "Supabase CLI $EXPECTED_CLI disponibile" ;;
    *) note "Versione CLI diversa da $EXPECTED_CLI; non verrà aggiornata automaticamente" ;;
  esac
else
  stop "Supabase CLI non trovata"
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    DOCKER_VERSION="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo non-rilevata)"
    DOCKER_MEM="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)"
    printf 'Docker Engine: %s\n' "$DOCKER_VERSION"
    if [ "$DOCKER_MEM" -gt 0 ] 2>/dev/null; then
      DOCKER_GIB="$(awk -v b="$DOCKER_MEM" 'BEGIN {printf "%.2f GiB", b/1073741824}')"
      printf 'Memoria Docker: %s\n' "$DOCKER_GIB"
      note "Non avviare lo stack Supabase completo sul Mac da 8 GiB; il profilo SQL resta da progettare e revisionare"
    else
      note "Memoria Docker non rilevata"
    fi
    RUNNING="$(docker ps -q 2>/dev/null | wc -l | tr -d ' ')"
    printf 'Container attivi: %s\n' "$RUNNING"
    if [ "$RUNNING" = "0" ]; then pass "Nessun container attivo"; else note "Sono presenti container attivi; lo script non li modifica"; fi
  else
    stop "Docker daemon non raggiungibile"
  fi
else
  stop "Docker CLI non trovata"
fi

if [ -f "$DUMP_PATH" ]; then
  ACTUAL_SHA="$(shasum -a 256 "$DUMP_PATH" | awk '{print $1}')"
  printf 'Dump schema-only: %s\n' "$DUMP_PATH"
  printf 'SHA-256: %s\n' "$ACTUAL_SHA"
  if [ "$ACTUAL_SHA" = "$EXPECTED_DUMP_SHA" ]; then
    pass "Dump corrisponde alla copia revisionata"
  else
    stop "SHA-256 dump diverso da quello atteso; non usare/importare il file"
  fi
  DATA_STATEMENTS="$(grep -Eic '^[[:space:]]*(COPY|INSERT[[:space:]]+INTO)[[:space:]]' "$DUMP_PATH" || true)"
  printf 'Istruzioni dati COPY/INSERT: %s\n' "$DATA_STATEMENTS"
  if [ "$DATA_STATEMENTS" = "0" ]; then pass "Nessuna istruzione COPY/INSERT rilevata"; else stop "Il dump contiene istruzioni dati: non importare"; fi
else
  stop "Dump schema-only non trovato in $DUMP_PATH"
fi

if [ -f "$ROOT/supabase/config.toml" ]; then
  note "supabase/config.toml già presente: non sovrascrivere"
else
  note "supabase/config.toml assente: non eseguire supabase init automaticamente"
fi

if [ -d "$ROOT/supabase/.temp" ]; then
  pass "supabase/.temp presente e lasciata intatta"
else
  note "supabase/.temp non rilevata"
fi

FREE_KB="$(df -Pk "$ROOT" 2>/dev/null | awk 'NR==2 {print $4}')"
if [ -n "${FREE_KB:-}" ]; then
  FREE_GIB="$(awk -v k="$FREE_KB" 'BEGIN {printf "%.1f GiB", k/1048576}')"
  printf 'Spazio libero: %s\n' "$FREE_GIB"
  if [ "$FREE_KB" -gt 20971520 ]; then pass "Spazio libero superiore a 20 GiB"; else note "Spazio libero inferiore a 20 GiB"; fi
fi

printf '\nRIEPILOGO | OK=%s | ATTENZIONE=%s | BLOCCO=%s\n' "$ok" "$warn" "$fail"
if [ "$fail" -gt 0 ]; then
  printf '%s\n' "ESITO | BLOCCATO: non avviare import, migrazioni o container."
  exit 2
fi
printf '%s\n' "ESITO | PRE-FLIGHT SUPERATO: solo raccolta requisiti; NON autorizza supabase start o import."
exit 0
