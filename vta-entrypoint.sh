#!/bin/sh
# First boot: render a non-interactive setup file and run `vta setup --from`.
# Later boots: skip straight to serving. State lives in the /var/lib/vta volume.
#
# DEV ONLY. The seed is a plaintext file on the volume.
set -eu

: "${ADMIN_DID:?ADMIN_DID is not set. Run \`npm run keygen\` first.}"
PORT="${VTA_PORT:-8100}"
CONFIG=/var/lib/vta/config.toml
# TOML array body, quoted strings. Override with CORS_ORIGINS_TOML.
DEFAULT_CORS='"http://localhost:3000", "http://localhost:5173", "http://localhost:8000"'
CORS="${CORS_ORIGINS_TOML:-$DEFAULT_CORS}"

if [ ! -f "$CONFIG" ]; then
  cat > /tmp/setup.toml <<TOML
config_path = "$CONFIG"
data_dir    = "/var/lib/vta/data"
vta_name    = "buildathon-vta"
public_url  = "http://localhost:$PORT"
admin_did   = "$ADMIN_DID"
admin_label = "buildathon-admin"

[server]
host = "0.0.0.0"
port = $PORT
# Exact-match origins; the VTA accepts no wildcard. Edit and re-create the
# volume (docker compose down -v) to change.
cors_origins = [$CORS]
# Dev loop: refill auth tokens quickly instead of 1 per 5 s.
rate_limit_interval_secs = 1
rate_limit_burst = 60

[log]
level  = "info"
format = "text"

[secrets]
backend = "plaintext"

[messaging]
kind = "skip"

[services]
didcomm = false
tsp     = false

[vta_did]
kind = "create_webvh"
url  = "http://localhost:$PORT"
TOML
  vta setup --from /tmp/setup.toml
fi

exec vta --config "$CONFIG"
