#!/bin/sh
set -eu

image="${1:?usage: smoke-test-container.sh IMAGE RUNTIME_ENV}"
runtime_env="${2:?usage: smoke-test-container.sh IMAGE RUNTIME_ENV}"
container_name="despertar-para-a-ciencia-api-smoke-$$"

cleanup() {
  podman rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

port=''
while IFS='=' read -r key value; do
  if [ "$key" = PORT ]; then port="$value"; break; fi
done < "$runtime_env"

case "$port" in
  ''|*[!0123456789]*) echo "runtime environment must define a numeric PORT" >&2; exit 78 ;;
esac
if [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then
  echo "rootless Podman requires PORT between 1024 and 65535" >&2
  exit 78
fi

podman run -d \
  --name "$container_name" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev \
  --env-file "$runtime_env" \
  --env NODE_ENV=production \
  "$image" >/dev/null

attempt=0
while [ "$attempt" -lt 30 ]; do
  if [ "$(podman container inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null || printf false)" != true ]; then
    podman logs "$container_name" >&2 || true
    exit 1
  fi
  if podman exec "$container_name" node -e "fetch('http://127.0.0.1:$port/health/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
    break
  fi
  if [ "$(podman container inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null || printf false)" != true ]; then
    podman logs "$container_name" >&2 || true
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$attempt" -ge 30 ]; then
  podman logs "$container_name" >&2 || true
  exit 1
fi

podman stop --time 30 "$container_name" >/dev/null
if [ "$(podman container inspect --format '{{.State.Running}}' "$container_name")" = true ]; then
  echo "container did not stop after SIGTERM" >&2
  exit 1
fi
