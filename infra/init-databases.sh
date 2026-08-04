#!/bin/bash
# Creates one database per service from POSTGRES_MULTIPLE_DATABASES.
# Runs once, on the first boot of an empty Postgres volume.
set -euo pipefail

if [ -z "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  echo "POSTGRES_MULTIPLE_DATABASES not set; skipping"
  exit 0
fi

for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
  # The entrypoint already created a database named after POSTGRES_USER, so
  # one of ours usually exists before this runs. CREATE DATABASE has no
  # IF NOT EXISTS, and with ON_ERROR_STOP=1 a duplicate would abort
  # initialisation and leave the remaining databases uncreated.
  exists=$(psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" \
    --username "$POSTGRES_USER" --dbname postgres)

  if [ "$exists" = "1" ]; then
    echo "database '$db' already exists; skipping create"
  else
    echo "creating database '$db'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
      CREATE DATABASE "$db";
      GRANT ALL PRIVILEGES ON DATABASE "$db" TO "$POSTGRES_USER";
EOSQL
  fi

  # PostGIS backs the radius search used by pet and provider discovery.
  # Idempotent, so it also repairs a database the entrypoint made without them.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
done

echo "database initialisation complete"
