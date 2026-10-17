#!/bin/bash
# Creates the MediLink database and its two roles (security 04 §4).
#
#   medilink_owner  owns the schema; used only for migrations (DATABASE_OWNER_URL). CREATEDB so the
#                   test runner can create test databases. Member of medilink_app so tests can
#                   `SET ROLE medilink_app`.
#   medilink_app    runtime role (DATABASE_URL): NOSUPERUSER NOBYPASSRLS, owns nothing, no DDL.
#                   Table privileges are granted after each `migrate` (medilink.core.db).
#
# Runs automatically on the first start of the docker compose PostgreSQL container, and in CI:
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=... POSTGRES_USER=postgres POSTGRES_DB=postgres \
#   MEDILINK_OWNER_PASSWORD=... MEDILINK_APP_PASSWORD=... bash backend/docker/postgres/init/01-roles.sh
set -euo pipefail

DB_NAME="${MEDILINK_DB_NAME:-medilink}"
OWNER_PASSWORD="${MEDILINK_OWNER_PASSWORD:?MEDILINK_OWNER_PASSWORD is required}"
APP_PASSWORD="${MEDILINK_APP_PASSWORD:?MEDILINK_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-postgres}" \
  -v db_name="$DB_NAME" -v owner_pw="$OWNER_PASSWORD" -v app_pw="$APP_PASSWORD" <<'EOSQL'
SELECT format('CREATE ROLE medilink_owner LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE CREATEDB PASSWORD %L', :'owner_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medilink_owner') \gexec
SELECT format('CREATE ROLE medilink_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medilink_app') \gexec
GRANT medilink_app TO medilink_owner;
SELECT format('CREATE DATABASE %I OWNER medilink_owner', :'db_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
EOSQL

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "$DB_NAME" <<'EOSQL'
-- Only the owner may create objects; the app role may only use the schema.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO medilink_owner;
GRANT USAGE ON SCHEMA public TO medilink_app;
-- Tables created later by the owner (migrations) are usable by the app role.
ALTER DEFAULT PRIVILEGES FOR ROLE medilink_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO medilink_app;
ALTER DEFAULT PRIVILEGES FOR ROLE medilink_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO medilink_app;
EOSQL

echo "MediLink roles ready: medilink_owner (migrations), medilink_app (runtime, NOBYPASSRLS)."
