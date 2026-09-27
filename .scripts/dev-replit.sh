#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
root="$PWD"
runtime="$root/.cache/nginx"
mkdir -p "$runtime"/{metadata,dicom,studies}

# Docker's config remains authoritative. Adapt only filesystem paths, memory
# limits and port for the unprivileged Nix process used by Replit.
sed \
  -e '/^user nginx;$/d' \
  -e 's/^worker_processes auto;/worker_processes 2;/' \
  -e "s|pid /var/run/nginx.pid;|pid $runtime/nginx.pid;|" \
  -e 's|error_log /var/log/nginx/error.log warn;|error_log /dev/stderr warn;|' \
  -e 's|access_log /var/log/nginx/access.log main;|access_log /dev/stdout main;|' \
  -e "s|/etc/nginx/mime.types|$(dirname "$(dirname "$(readlink -f "$(command -v nginx)")")")/conf/mime.types|" \
  -e "s|/etc/nginx/cors_options.inc|$root/proxy/cors_options.inc|" \
  -e "s|/var/cache/nginx/|$runtime/|g" \
  -e 's/keys_zone=dicom:3000m/keys_zone=dicom:64m/' \
  -e 's/max_size=150g/max_size=2g/' \
  -e 's/^[[:space:]]*listen 80;$/        listen 8080;/' \
  "$root/proxy/nginx.conf" > "$runtime/nginx.conf"

nginx -e /dev/stderr -p "$runtime/" -c "$runtime/nginx.conf" -t
nginx -e /dev/stderr -p "$runtime/" -c "$runtime/nginx.conf" -g 'daemon off;' &
proxy_pid=$!
viewer_pid=
cleanup() {
  if [[ -n "$viewer_pid" ]]; then
    kill "$viewer_pid" 2>/dev/null || true
    wait "$viewer_pid" 2>/dev/null || true
  fi
  kill "$proxy_pid" 2>/dev/null || true
  wait "$proxy_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:8080/health >/dev/null; then
    break
  fi
  if ! kill -0 "$proxy_pid" 2>/dev/null; then
    echo "El proxy nginx terminó antes de arrancar el visor." >&2
    exit 1
  fi
  if (( attempt == 30 )); then
    echo "El proxy nginx no respondió en el puerto 8080." >&2
    exit 1
  fi
  sleep 1
done

export APP_CONFIG=config/viewmed.js OHIF_PORT=5000 OHIF_OPEN=false
export PROXY_TARGET=http://127.0.0.1:8080 PROXY_DOMAIN=http://127.0.0.1:8080
export PROXY_PATH_REWRITE_FROM=/pacs PROXY_PATH_REWRITE_TO=/pacs
yarn dev &
viewer_pid=$!
while kill -0 "$viewer_pid" 2>/dev/null && kill -0 "$proxy_pid" 2>/dev/null; do
  sleep 2
done
if ! kill -0 "$proxy_pid" 2>/dev/null; then
  echo "El proxy nginx se detuvo; se detendrá también el visor." >&2
  exit 1
fi
wait "$viewer_pid"