#!/bin/sh
# First boot: phase 1 (mint a setup did:key), wait for the VTA grant, phase 2
# (`vtc setup --from`), seed the admin ACL, add CORS. Later boots just serve.
# DEV ONLY (plaintext secrets). Verified end to end against vtc-service 0.15.0: see docs/VTC.md.
set -eu

: "${ADMIN_DID:?ADMIN_DID is not set. Run \`npm run vta:keygen\` first.}"
PORT="${VTC_PORT:-8200}"
DIR=/var/lib/vtc
CONFIG=$DIR/config.toml
KEY=$DIR/setup-key.json
CTX="${VTC_CONTEXT:-vtc}"
DEFAULT_CORS='"http://localhost:3000", "http://localhost:5173", "http://localhost:8000"'
CORS="${VTC_CORS_ORIGINS_TOML:-$DEFAULT_CORS}"

if [ ! -f "$CONFIG" ]; then
  [ -f "$KEY" ] || vtc setup --setup-key-out "$KEY" --context "$CTX"
  # The VTC reaches the VTA over the shared network namespace (see compose), so the
  # VTA's loopback DID host resolves to the VTA.
  until wget -qO /tmp/vta.jsonl "http://localhost:${VTA_PORT:-8100}/.well-known/did.jsonl"; do sleep 2; done
  # The DID is the first `"id":"did:..."` (no #fragment) in the log; a greedy sed on
  # `"state":{...}` picks the last id, i.e. the `#vta-rest` service id, and the VTA
  # then refuses the VTC's sign-in as wrongRecipient.
  VTA_DID=$(grep -o '"id":"did:[^"#]*"' /tmp/vta.jsonl | head -1 | sed 's/"id":"\(.*\)"/\1/')
  cat > /tmp/vtc-setup.toml <<TOML
config_path    = "$CONFIG"
base_url       = "http://localhost:$PORT"
vta_did        = "$VTA_DID"
context        = "$CTX"
setup_key_file = "$KEY"
provision_transport = "rest"
single_admin_mode = true

[secrets]
backend = "plaintext"
TOML
  # Phase 2 fails until the setup DID is granted at the VTA (npm run vtc:up does it).
  echo "waiting for the VTA grant of the setup DID; retrying phase 2 every 5s" >&2
  until vtc setup --from /tmp/vtc-setup.toml; do sleep 5; done
  # `vtc setup` already writes `[cors]` with `allowed_origins = []`; appending a second
  # [cors] table is a duplicate-key parse error, so fill in the existing line.
  sed -i "s|^allowed_origins = \[\]\$|allowed_origins = [$CORS]|" "$CONFIG"
  grep -q '^allowed_origins = \["' "$CONFIG" || { echo "could not set [cors] allowed_origins in $CONFIG" >&2; exit 1; }
  # Offline ACL write (daemon is not running yet): the buildathon admin key can approve joins.
  vtc --config "$CONFIG" acl add --did "$ADMIN_DID" --role admin --label buildathon-admin
fi

exec vtc --config "$CONFIG"
