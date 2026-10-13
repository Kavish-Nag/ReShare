#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL securely in your shell/session}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/db/migrations/001_initial_schema.sql
