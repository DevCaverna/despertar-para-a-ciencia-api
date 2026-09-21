#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
	printf 'usage: %s OUTPUT_FILE\n' "$0" >&2
	exit 64
fi

output_file=$1
output_dir=$(dirname "$output_file")
mkdir -p "$output_dir"
umask 077

temporary_file="$output_file.tmp.$$"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

write_required() {
	name=$1
	value=$(printenv "$name" || true)
	if [ -z "$value" ]; then
		printf '%s must be set\n' "$name" >&2
		exit 78
	fi
	printf '%s=%s\n' "$name" "$value" >> "$temporary_file"
}

write_optional() {
	name=$1
	value=$(printenv "$name" || true)
	if [ -n "$value" ]; then
		printf '%s=%s\n' "$name" "$value" >> "$temporary_file"
	fi
}

: > "$temporary_file"

write_required NODE_ENV
write_required PORT
write_required SEND_EMAILS
write_required MAIL_DRIVER
write_optional CORS_ORIGINS
write_required SWAGGER_ENABLED
write_required DATABASE_URL
write_required FIREBASE_PROJECT_ID
write_required FIREBASE_CLIENT_EMAIL

firebase_private_key=$(printenv FIREBASE_PRIVATE_KEY || true)
if [ -z "$firebase_private_key" ]; then
	printf 'FIREBASE_PRIVATE_KEY must be set\n' >&2
	exit 78
fi
firebase_private_key=$(printf '%s' "$firebase_private_key" | sed 's/$/\\n/' | tr -d '\n')
printf 'FIREBASE_PRIVATE_KEY=%s\n' "$firebase_private_key" >> "$temporary_file"

write_optional LOG_LEVEL
write_optional API_NAME
write_optional BREVO_API_KEY
write_optional BREVO_SENDER_EMAIL
write_required STORAGE_DRIVER
write_optional CLOUDFLARE_R2_ACCOUNT_ID
write_optional CLOUDFLARE_R2_ACCESS_KEY_ID
write_optional CLOUDFLARE_R2_SECRET_ACCESS_KEY
write_optional CLOUDFLARE_R2_BUCKET_NAME
write_optional CLOUDFLARE_R2_PUBLIC_URL
write_optional OTEL_EXPORTER_OTLP_ENDPOINT
write_optional OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE
write_optional OTEL_EXPORTER_OTLP_CLIENT_KEY
write_optional OTEL_SERVICE_NAME
write_optional OTEL_RESOURCE_ATTRIBUTES
write_optional OTEL_TRACES_SAMPLER
write_optional OTEL_TRACES_SAMPLER_ARG

mv "$temporary_file" "$output_file"
trap - EXIT HUP INT TERM
