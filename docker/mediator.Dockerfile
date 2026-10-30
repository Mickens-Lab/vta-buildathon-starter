# Builds the messaging mediator used by MODE=tunnel (docs/MODES.md). It is the Affinidi mediator
# from the affinidi-messaging-mediator repo at the ref pinned in pins.json (mediator.ref), built with DIDComm and TSP.
#
#   npm run images:build mediator        (checks memory, then runs this file)
#   docker build -f docker/mediator.Dockerfile -t mediator-buildathon:local docker
#
# Heavy: a cold build takes about 15 minutes on a 12-core machine. The upstream estimate is 8 GB
# of RAM; one observed build stayed within about 1.5 GB above idle. Run it under `nice -n 10`.
#
# The image holds two binaries: `mediator` (the server) and `mediator-setup` (creates the
# the mediator-entrypoint.sh script (repo root) drives both.
ARG RUST_VERSION=1.95
FROM rust:${RUST_VERSION}-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential pkg-config libdbus-1-dev libssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
ARG MEDIATOR_REPO=https://github.com/affinidi/affinidi-messaging-mediator.git
ARG MEDIATOR_REF
RUN test -n "${MEDIATOR_REF}" \
    && git init -q . \
    && git remote add origin "${MEDIATOR_REPO}" \
    && git fetch -q --depth 1 origin "${MEDIATOR_REF}" \
    && git checkout -q FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${MEDIATOR_REF}"
ARG FEATURES="tsp,secrets-aws"
RUN cargo build --release --locked -p affinidi-messaging-mediator --features "${FEATURES}"
RUN cargo build --release --locked -p affinidi-messaging-mediator-setup \
      --no-default-features --features secrets-aws,publish-aws

FROM debian:bookworm-slim
ARG MEDIATOR_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/affinidi/affinidi-messaging-mediator" \
      org.opencontainers.image.title="buildathon mediator" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.buildathon.mediator-ref="${MEDIATOR_REF}"
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /src/crates/affinidi-messaging-mediator/conf conf
COPY --from=builder /src/target/release/mediator /usr/local/bin/
COPY --from=builder /src/target/release/mediator-setup /usr/local/bin/
RUN groupadd -r -g 10002 mediator && useradd -r -u 10002 -g mediator mediator
# The entrypoint script starts as root (to write the volume), then drops to uid 10002.
EXPOSE 7037
ENTRYPOINT ["/usr/local/bin/mediator"]
