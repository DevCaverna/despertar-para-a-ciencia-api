#!/bin/sh
set -eu

image="${1:?usage: smoke-test-image.sh IMAGE}"
base_dir=${RUNNER_TEMP:-${TMPDIR:-/tmp}}
smoke_dir=$(mktemp -d "$base_dir/despertar-para-a-ciencia-api-smoke.XXXXXX")
smoke_env="$smoke_dir/runtime.env"

cleanup() {
  rm -rf "$smoke_dir"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
umask 077

firebase_private_key=$(openssl genrsa 2048 2>/dev/null)
firebase_private_key=$(printf '%s\n' "$firebase_private_key" | sed 's/$/\\n/' | tr -d '\n')

printf '%s\n' \
  'API_NAME=Despertar para a Ciência API smoke test' \
  'DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/smoke' \
  'FIREBASE_CLIENT_EMAIL=test@test.iam.gserviceaccount.com' \
  'FIREBASE_PROJECT_ID=test-project' \
  'LOG_LEVEL=warn' \
  'MAIL_DRIVER=noop' \
  'NODE_ENV=test' \
  'PORT=3000' \
  'SEND_EMAILS=false' \
  'STORAGE_DRIVER=memory' \
  'SWAGGER_ENABLED=false' \
  "FIREBASE_PRIVATE_KEY=$firebase_private_key" > "$smoke_env"

sh scripts/smoke-test-container.sh "$image" "$smoke_env"
