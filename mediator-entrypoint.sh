#!/bin/sh
# MODE=tunnel mediator: first boot creates the mediator's own identity with `mediator-setup --from`
# and patches the public endpoint; later boots just serve. State lives in the /conf volume.
#
# The mediator's DID is a did:webvh bound to its tunnel host (about 110 bytes), minted here by mediator-setup and served by
# the mediator itself at https://$MEDIATOR_HOST/.well-known/did.jsonl. It is short on purpose: a did:peer:2 applicant names
# this DID in its TSPTransport service, and the DID resolver the mediator and the VTC use refuses DIDs over 1000 bytes
# (a did:peer:2 mediator DID is about 725 bytes, which pushed the applicant to about 1115). docs/MESSAGING.md.
#
# DEV ONLY. The mediator runs with an OPEN ACL (mediator_acl_mode = explicit_deny with
# global_acl_default = ALLOW_ALL, the generated default): ANY DID may register and relay through it
# while the tunnel is up. A closed mediator rejects a did:webvh VTA (403) and the VTA then silently
# falls back to REST only, so the open ACL is needed for the tunnel demo. See docs/MODES.md.
set -eu

: "${MEDIATOR_HOST:?MEDIATOR_HOST is not set. MODE=tunnel (npm run up) sets it from the tunnel.}"
CONF=/conf
CONFIG=$CONF/mediator.toml
REDIS_URL="${REDIS_URL:-redis://redis:6379/}"
MARKER=$CONF/.starter-public-host

if [ -f "$CONFIG" ]; then
  if [ "$(cat "$MARKER" 2>/dev/null)" != "$MEDIATOR_HOST" ]; then
    echo "refusing to start: this volume was set up for another tunnel host. The mediator DID names that host" >&2
    echo "and is dead now. Reset with: npm run down (MODE=tunnel), then npm run up." >&2
    exit 1
  fi
else
  cat > /tmp/recipe.toml <<TOML
[deployment]
type = "server"
protocols = ["didcomm", "tsp"]
use_vta = false

[identity]
did_method = "did:webvh"
public_url = "https://$MEDIATOR_HOST"

[secrets]
storage = "file://$CONF/mediator-secrets.json"

[security]
ssl = "none"
admin = "generate"
jwt_mode = "generate"
network_mode = "open"
cors = "none"

[database]
url = "$REDIS_URL"

[output]
config_path = "$CONFIG"
listen_address = "0.0.0.0:7037"
api_prefix = "/mediator/v1/"

[install]
enabled = false
TOML
  # mediator-setup prints the admin PRIVATE key on stdout: keep stdout out of the container logs.
  if ! mediator-setup --from /tmp/recipe.toml >/tmp/setup.out 2>/tmp/setup.err; then
    echo "mediator-setup failed:" >&2
    cat /tmp/setup.err >&2
    exit 1
  fi
  rm -f /tmp/setup.out /tmp/recipe.toml "$CONF/admin-monitor.json"
  # The generated file has the public endpoint commented out; without it the mediator rejects
  # messages addressed to its public URL.
  sed -i "s|^# *local_endpoints = .*|local_endpoints = [\"https://$MEDIATOR_HOST\"]|" "$CONFIG"
  grep -q "^local_endpoints = \[\"https://$MEDIATOR_HOST\"\]" "$CONFIG" || { echo "could not set local_endpoints in $CONFIG" >&2; exit 1; }
  # mediator-setup writes `did_web_self_hosted = "file://./conf/did.jsonl"`, but writes the log next to the config
  # ($CONF/did.jsonl) and the mediator reads that path relative to its working directory (/app), not the config's.
  # Without this the mediator cannot serve its own DID log. Upstream quirk (mediator 0.45.0).
  sed -i "s|^did_web_self_hosted = .*|did_web_self_hosted = \"file://$CONF/did.jsonl\"|" "$CONFIG"
  grep -q "^did_web_self_hosted = \"file://$CONF/did.jsonl\"\$" "$CONFIG" || { echo "could not set did_web_self_hosted in $CONFIG" >&2; exit 1; }
  [ -s "$CONF/did.jsonl" ] || { echo "mediator-setup wrote no $CONF/did.jsonl (the did:webvh log)" >&2; exit 1; }
  echo "$MEDIATOR_HOST" > "$MARKER"
  chown -R 10002:10002 "$CONF"
  chmod 600 "$CONF"/mediator-secrets.json "$CONFIG"
  chmod 644 "$CONF/did.jsonl"
fi

# Browser access (optional, default off). MEDIATOR_CORS_ALLOW_ORIGIN becomes `[security] cors_allow_origin`:
# one exact origin (https://app.example), a "*.suffix" pattern, or "*". Unset = no cross-origin access, and the
# mediator also refuses a /ws upgrade that carries a browser Origin header. Applied on every boot, so it can change
# without resetting the volume. The token travels in a header, not a cookie; still prefer an exact origin.
if [ -n "${MEDIATOR_CORS_ALLOW_ORIGIN:-}" ]; then
  case "$MEDIATOR_CORS_ALLOW_ORIGIN" in
    *[!A-Za-z0-9:/.*-]*) echo "MEDIATOR_CORS_ALLOW_ORIGIN may only hold letters, digits and : / . * - (one origin)" >&2; exit 1 ;;
  esac
  sed -i "s|^#* *cors_allow_origin = .*|cors_allow_origin = \"$MEDIATOR_CORS_ALLOW_ORIGIN\"|" "$CONFIG"
  grep -q "^cors_allow_origin = \"$MEDIATOR_CORS_ALLOW_ORIGIN\"\$" "$CONFIG" || { echo "could not set cors_allow_origin in $CONFIG" >&2; exit 1; }
  echo "mediator CORS allows origin: $MEDIATOR_CORS_ALLOW_ORIGIN" >&2
fi

echo "DEV ONLY: mediator ACL is OPEN (any DID may register and relay) while this tunnel is up." >&2
exec setpriv --reuid=10002 --regid=10002 --clear-groups mediator -c "$CONFIG"
