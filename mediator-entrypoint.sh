#!/bin/sh
# MODE=tunnel mediator: first boot creates the mediator's own identity with `mediator-setup --from`
# and patches the public endpoint; later boots just serve. State lives in the /conf volume.
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
did_method = "did:peer"
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
  echo "$MEDIATOR_HOST" > "$MARKER"
  chown -R 10002:10002 "$CONF"
  chmod 600 "$CONF"/mediator-secrets.json "$CONFIG"
fi

echo "DEV ONLY: mediator ACL is OPEN (any DID may register and relay) while this tunnel is up." >&2
exec setpriv --reuid=10002 --regid=10002 --clear-groups mediator -c "$CONFIG"
