#!/bin/sh
# First boot: render a non-interactive setup file and run `vta setup --from`.
# Later boots: skip straight to serving. State lives in the /var/lib/vta volume.
#
# DEV ONLY. The seed is a plaintext file on the volume.
#
# MODE=local (default): loopback DID, REST only, no mediator.
# MODE=tunnel: PUBLIC_HOST (the VTA's quick-tunnel host) and MEDIATOR_DID are set by `npm run up`;
#   the DID is did:webvh at that host and messaging (DIDComm + TSP) uses the existing mediator.
#   The DID is bound to the host, so a volume made for another host is refused, not reused.
set -eu

: "${ADMIN_DID:?ADMIN_DID is not set. Run \`npm run keygen\` first.}"
PORT="${VTA_PORT:-8100}"
CONFIG=/var/lib/vta/config.toml
# TOML array body, quoted strings. Override with CORS_ORIGINS_TOML.
DEFAULT_CORS='"http://localhost:3000", "http://localhost:5173", "http://localhost:8000"'
CORS="${CORS_ORIGINS_TOML:-$DEFAULT_CORS}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
MARKER=/var/lib/vta/.starter-public-url
if [ -n "$PUBLIC_HOST" ]; then
  : "${MEDIATOR_DID:?MODE=tunnel needs MEDIATOR_DID (npm run up sets it once the mediator is up).}"
  PUBLIC_URL="https://$PUBLIC_HOST"
  MESSAGING_TOML="kind = \"existing\"
did  = \"$MEDIATOR_DID\""
  SERVICES_TOML="didcomm = true
tsp     = true"
else
  PUBLIC_URL="http://localhost:$PORT"
  MESSAGING_TOML='kind = "skip"'
  SERVICES_TOML="didcomm = false
tsp     = false"
fi
if [ -f "$CONFIG" ] && [ -f "$MARKER" ] && [ "$(cat "$MARKER")" != "$PUBLIC_URL" ]; then
  echo "refusing to start: this volume was set up for $(cat "$MARKER"), not $PUBLIC_URL. A did:webvh DID is bound to" >&2
  echo "its host, so the old identity cannot move. Reset with: npm run down, then npm run up." >&2
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  cat > /tmp/setup.toml <<TOML
config_path = "$CONFIG"
data_dir    = "/var/lib/vta/data"
vta_name    = "buildathon-vta"
public_url  = "$PUBLIC_URL"
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
$MESSAGING_TOML

[services]
$SERVICES_TOML

[vta_did]
kind = "create_webvh"
url  = "$PUBLIC_URL"
TOML
  vta setup --from /tmp/setup.toml
  echo "$PUBLIC_URL" > "$MARKER"
fi

exec vta --config "$CONFIG"
