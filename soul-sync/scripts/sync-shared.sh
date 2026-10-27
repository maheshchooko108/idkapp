#!/usr/bin/env bash
# Copies the pure-TS core into the edge functions. Supabase bundles each
# function from supabase/functions, so the files must live there too.
# A test in shared/test fails if the copies drift.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/supabase/functions/_shared/core"
mkdir -p "$dest"
cp "$root"/shared/*.ts "$dest"/
echo "synced shared/*.ts -> supabase/functions/_shared/core/"
