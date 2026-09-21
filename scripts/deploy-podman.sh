#!/bin/sh
set -eu

environment="$1"
app_name="$2"
image="$3"
runtime_env="$4"
otel_client_cert="${5:-}"
otel_client_key="${6:-}"

if [ "$#" -ne 4 ] && [ "$#" -ne 6 ]; then
  echo "usage: $0 ENVIRONMENT APP_NAME IMAGE RUNTIME_ENV [OTEL_CLIENT_CERT OTEL_CLIENT_KEY]" >&2
  exit 64
fi

case "$environment" in
  ''|*[!a-zA-Z0-9_.-]*) echo "invalid environment" >&2; exit 64 ;;
esac

case "$app_name" in
  [a-z0-9][a-z0-9_.-]*) ;;
  *) echo "invalid application name" >&2; exit 64 ;;
esac

case "$image" in
  *:????????????????????????????????????????????????????????????????) ;;
  *) echo "image must be a transferred image tagged by sha256 digest" >&2; exit 64 ;;
esac
image_digest="${image##*:}"
case "$image_digest" in
  *[!0123456789abcdef]*) echo "image digest must be lowercase hexadecimal" >&2; exit 64 ;;
esac

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
container_name="$app_name-$environment"

if [ ! -r "$runtime_env" ]; then
  echo "temporary runtime environment file is missing" >&2
  exit 78
fi

if [ -n "$otel_client_cert" ] || [ -n "$otel_client_key" ]; then
  if [ -z "$otel_client_cert" ] || [ -z "$otel_client_key" ]; then
    echo "OTEL client certificate and key must be provided together" >&2
    exit 78
  fi
  if [ ! -r "$otel_client_cert" ] || [ ! -r "$otel_client_key" ]; then
    echo "OTEL client certificate and key must be readable" >&2
    exit 78
  fi
  echo 'mTLS enabled' >&2
else
  echo 'mTLS disabled' >&2
fi

port=''
database_url=''
while IFS='=' read -r key value; do
  case "$key" in
    PORT) port="$value" ;;
    DATABASE_URL) database_url="$value" ;;
  esac
done < "$runtime_env"

case "$port" in
  ''|*[!0123456789]*) echo "runtime environment must define a numeric PORT" >&2; exit 78 ;;
esac
if [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then
  echo "rootless Podman requires PORT between 1024 and 65535" >&2
  exit 78
fi

if [ -z "$database_url" ]; then
  echo "runtime environment must define DATABASE_URL" >&2
  exit 78
fi

# Serialize deployments on the host as a second line of defense for callers
# outside GitHub Actions and for jobs targeting the same environment.
if ! command -v flock >/dev/null 2>&1; then
  echo "flock is required to serialize deployments" >&2
  exit 69
fi
if ! command -v timeout >/dev/null 2>&1; then
  echo "timeout is required to bound deployment operations" >&2
  exit 69
fi

lock_dir="$XDG_RUNTIME_DIR/${app_name}-locks"
mkdir -p "$lock_dir"
chmod 700 "$lock_dir"
lock_file="$lock_dir/deploy-$environment.lock"

if [ "${DEPLOY_LOCK_HELD:-0}" != 1 ]; then
  echo "waiting for deployment lock: $environment" >&2

  exec flock \
    --exclusive \
    --wait 30 \
    --close \
    "$lock_file" \
    env DEPLOY_LOCK_HELD=1 "$0" "$@"
fi

echo "deployment lock acquired: $environment" >&2
echo 'Podman storage before deployment:' >&2
podman system df >&2

timeout --foreground 30 podman run --rm \
  --env-file "$runtime_env" \
  "$image" node ./scripts/validate-deployment-env.mjs

timeout --foreground 120 podman run --rm --env-file "$runtime_env" "$image" ./node_modules/.bin/prisma migration status

timeout --foreground 120 podman run --rm --env-file "$runtime_env" "$image" ./node_modules/.bin/prisma db migrate

timeout --foreground 120 podman run --rm --env-file "$runtime_env" "$image" ./node_modules/.bin/prisma db verify

otel_secret_cert=''
otel_secret_key=''
app_uid=''
app_gid=''
cleanup_otel_secrets() {
  [ -z "$otel_secret_cert" ] || podman secret rm "$otel_secret_cert" >/dev/null 2>&1 || true
  [ -z "$otel_secret_key" ] || podman secret rm "$otel_secret_key" >/dev/null 2>&1 || true
}
trap cleanup_otel_secrets EXIT

if [ -n "$otel_client_cert" ]; then
  secret_suffix="$(date +%s)-$$"
  secret_prefix="$app_name-$environment-otel-$secret_suffix"
  otel_secret_cert="$secret_prefix-cert"
  otel_secret_key="$secret_prefix-key"
  podman secret create "$otel_secret_cert" "$otel_client_cert" >/dev/null
  podman secret create "$otel_secret_key" "$otel_client_key" >/dev/null
  app_identity=$(podman run --rm --entrypoint /bin/sh "$image" -c 'id -u; id -g')
  app_uid=$(printf '%s\n' "$app_identity" | sed -n '1p')
  app_gid=$(printf '%s\n' "$app_identity" | sed -n '2p')
  case "$app_uid:$app_gid" in
    ''|*[!0123456789:]*) echo 'image app user identity is invalid' >&2; exit 78 ;;
  esac
fi

run_image() {
  image_ref=$1
  shift
  run_timeout=${run_timeout:-120}
  if [ -n "$otel_secret_cert" ]; then
    timeout --foreground "$run_timeout" podman run "$@" \
      --secret "$otel_secret_cert,type=mount,target=/run/secrets/otel-client.crt,uid=$app_uid,gid=$app_gid,mode=0400" \
      --secret "$otel_secret_key,type=mount,target=/run/secrets/otel-client.key,uid=$app_uid,gid=$app_gid,mode=0400" \
      "$image_ref"
  else
    timeout --foreground "$run_timeout" podman run "$@" "$image_ref"
  fi
}

start_container() {
  run_timeout=30 run_image \
    "$1" \
    -d \
    --name "$container_name" \
    --restart unless-stopped \
    --stop-timeout 30 \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev \
    --env-file "$runtime_env" \
    -p "127.0.0.1:$port:$port" >/dev/null
}

wait_for_readiness() {
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if timeout --foreground 5 podman exec "$1" node -e "fetch('http://127.0.0.1:$port/health/ready', { signal: AbortSignal.timeout(2000) }).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"; then
      return 0
    fi
    if [ "$(podman container inspect --format '{{.State.Running}}' "$1" 2>/dev/null || printf false)" != true ]; then
      timeout --foreground 10 podman logs "$1" >&2 || true
      return 1
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  timeout --foreground 10 podman logs "$1" >&2 || true
  return 1
}

candidate_name="$container_name-candidate"
podman rm -f "$candidate_name" >/dev/null 2>&1 || true
if ! run_timeout=30 run_image "$image" -d --name "$candidate_name" --stop-timeout 30 --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev --env-file "$runtime_env" >/dev/null || ! wait_for_readiness "$candidate_name"; then
  podman rm -f "$candidate_name" >/dev/null 2>&1 || true
  exit 1
fi
podman rm -f "$candidate_name" >/dev/null

old_image=''
if podman container exists "$container_name"; then
  # Keep the immutable image ID; ImageName may point to a deploy tag that is
  # removed below after the new image is promoted.
  old_image=$(podman container inspect --format '{{.Image}}' "$container_name")
  podman tag "$old_image" "$app_name-$environment:previous"
  timeout --foreground 40 podman stop -t 30 "$container_name"
  podman rm "$container_name"
fi

if ! start_container "$image" || ! wait_for_readiness "$container_name"; then
  podman logs "$container_name" >&2 || true
  podman rm -f "$container_name" >/dev/null 2>&1 || true
  if [ -n "$old_image" ]; then
    if ! start_container "$old_image" || ! wait_for_readiness "$container_name"; then
      echo "rollback failed: previous image is not ready" >&2
      podman logs "$container_name" >&2 || true
    fi
  fi
  exit 1
fi

podman tag "$image" "$app_name-$environment:active"

active_secret_names=''
active_secret_inspect_ok=1
if ! active_secret_names=$(podman inspect "$container_name" --format '{{range .Config.Secrets}}{{.Name}}{{"\n"}}{{end}}' 2>/dev/null); then
  active_secret_inspect_ok=0
fi
if [ "$active_secret_inspect_ok" -eq 1 ]; then
  for secret in $(podman secret ls --format '{{.Name}}' 2>/dev/null || true); do
    case "$secret" in
      "$app_name-$environment-otel-"*)
        case "$secret" in
          "$otel_secret_cert"|"$otel_secret_key") ;;
          *)
            secret_in_use=0
            while IFS= read -r active_secret; do
              [ "$active_secret" = "$secret" ] && secret_in_use=1
            done <<EOF
$active_secret_names
EOF
            [ "$secret_in_use" -eq 1 ] || podman secret rm "$secret" >/dev/null 2>&1 || true
            ;;
        esac
        ;;
    esac
  done
fi

trap - EXIT
otel_secret_cert=''
otel_secret_key=''

podman image ls --format '{{.Repository}}:{{.Tag}}' | while IFS= read -r reference; do
  case "$reference" in
    "$app_name"-"$environment"-deploy:*|*/"$app_name"-"$environment"-deploy:*)
      if image_id=$(podman image inspect --format '{{.Id}}' "$reference" 2>/dev/null); then
        podman untag "$image_id" "$reference" >/dev/null 2>&1 || true
      fi
      ;;
  esac
done

source_label=$(podman image inspect --format '{{ index .Labels "org.opencontainers.image.source" }}' "$app_name-$environment:active")
if [ -n "$source_label" ]; then
  # Without --all, Podman prunes only dangling images; active and previous
  # remain rollback references because they retain explicit tags.
  podman image prune --force --filter "label=org.opencontainers.image.source=$source_label" >/dev/null
fi
echo 'Podman storage after deployment cleanup:' >&2
podman system df >&2

echo "deployed $image to $environment"
