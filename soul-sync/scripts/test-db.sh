#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres (with a stub auth
# schema) and runs the RLS/metrics assertions. Needs Postgres 15+ binaries.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
work="$(mktemp -d)"
port="${PG_PORT:-54329}"
run() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$work"
trap 'run "$bin/pg_ctl" -D "$work/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

run "$bin/initdb" -D "$work/data" -A trust -U postgres >/dev/null
run "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/log" start >/dev/null
psql=(psql -h "$work" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q)
"${psql[@]}" -c 'create database soulsync'
"${psql[@]}" -d soulsync -f "$root/supabase/tests/stub_auth.sql"
for f in "$root"/supabase/migrations/*.sql; do "${psql[@]}" -d soulsync -f "$f"; done
"${psql[@]}" -d soulsync -f "$root/supabase/tests/rls_test.sql"
