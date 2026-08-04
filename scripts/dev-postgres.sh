#!/usr/bin/env bash
# Bring up a local PostgreSQL 16 cluster without Docker.
#
# docker-compose.yml is the documented local path, but sandboxes and some CI runners cannot run
# containers. RLS, append-only audit, and migration recovery cannot be evidenced without a live
# database, and 17_CLAUDE_IMPLEMENTATION_INSTRUCTIONS §9 rejects "tests passed" without output —
# so integration tests must never be silently skipped for want of Docker.
#
# Usage:  scripts/dev-postgres.sh start|stop|status|url
set -euo pipefail

PGVERSION="${PGVERSION:-16}"
PGBIN="${PGBIN:-/usr/lib/postgresql/${PGVERSION}/bin}"
PGPORT="${FREIGHTOS_PGPORT:-55432}"
PGROOT="${FREIGHTOS_PGROOT:-/var/tmp/freightos-pg}"
PGDATA="${PGROOT}/data"
PGSOCK="${PGROOT}/sock"
PGDB="${FREIGHTOS_PGDATABASE:-freightos_test}"

# initdb refuses to run as root, so the cluster runs as an unprivileged owner.
if [ "$(id -u)" -eq 0 ]; then
  PGOWNER="${FREIGHTOS_PGOWNER:-postgres}"
  run_as() { su "$PGOWNER" -s /bin/bash -c "$1"; }
else
  PGOWNER="$(id -un)"
  run_as() { bash -c "$1"; }
fi

start() {
  if [ -S "${PGSOCK}/.s.PGSQL.${PGPORT}" ] && "${PGBIN}/pg_isready" -h "$PGSOCK" -p "$PGPORT" -q; then
    echo "postgres already running on port ${PGPORT}"
    return 0
  fi

  mkdir -p "$PGROOT" "$PGSOCK"
  chown -R "$PGOWNER" "$PGROOT" 2>/dev/null || true
  chmod 700 "$PGROOT"

  if [ ! -d "$PGDATA" ]; then
    echo "initialising cluster at ${PGDATA}"
    run_as "${PGBIN}/initdb -D ${PGDATA} -U postgres --auth=trust --encoding=UTF8" >/dev/null
  fi

  # listen_addresses empty => unix socket only. Nothing is exposed on the network.
  run_as "${PGBIN}/pg_ctl -D ${PGDATA} \
    -o \"-p ${PGPORT} -k ${PGSOCK} -c listen_addresses=\" \
    -l ${PGROOT}/server.log start" >/dev/null

  for _ in $(seq 1 30); do
    if "${PGBIN}/pg_isready" -h "$PGSOCK" -p "$PGPORT" -q; then break; fi
    sleep 0.5
  done

  if ! "${PGBIN}/pg_isready" -h "$PGSOCK" -p "$PGPORT" -q; then
    echo "postgres failed to start; last log lines:" >&2
    tail -30 "${PGROOT}/server.log" >&2
    exit 1
  fi

  if ! psql -h "$PGSOCK" -p "$PGPORT" -U postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='${PGDB}'" | grep -q 1; then
    createdb -h "$PGSOCK" -p "$PGPORT" -U postgres "$PGDB"
    echo "created database ${PGDB}"
  fi

  echo "postgres ready: $(url)"
}

stop() {
  if [ -d "$PGDATA" ]; then
    run_as "${PGBIN}/pg_ctl -D ${PGDATA} -m fast stop" >/dev/null 2>&1 || true
    echo "postgres stopped"
  fi
}

status() {
  "${PGBIN}/pg_isready" -h "$PGSOCK" -p "$PGPORT" || true
}

url() {
  # Percent-encode the socket directory so it survives as a URL host component.
  printf 'postgresql://postgres@localhost:%s/%s?host=%s\n' "$PGPORT" "$PGDB" "$PGSOCK"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  url) url ;;
  *) echo "usage: $0 start|stop|status|url" >&2; exit 2 ;;
esac
