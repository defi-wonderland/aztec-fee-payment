#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Aztec Fee Payment — Full Setup for Claude Cloud
#
# Paste this entire script into a Claude Cloud terminal to bootstrap the
# development environment from scratch.
#
# What it does:
#   1. Starts the Docker daemon with gVisor-compatible flags
#   2. Pulls the Aztec Docker image
#   3. Creates a persistent toolchain container (avoids slow vfs deep-copies)
#   4. Installs aztec CLI wrappers that delegate to docker exec
#   5. Installs Node.js dependencies
#   6. Compiles Noir contracts
#   7. Generates TypeScript artifact bindings
#   8. Builds the TypeScript package
#
# Why a persistent container?
#   Claude Cloud runs on gVisor, which only supports the Docker "vfs" storage
#   driver.  vfs deep-copies the entire image rootfs (~16 GB) on every
#   `docker run`.  By keeping one long-lived container and using `docker exec`,
#   the copy happens only once.
#
# Prerequisites (pre-installed in Claude Cloud):
#   Node.js >= 22 · Yarn 1.22 (corepack) · Docker CLI · curl
#
# Re-runnable: every step is idempotent.
###############################################################################

AZTEC_VERSION="3.0.0-devnet.6-patch.1"
REPO_DIR="/home/user/aztec-fee-payment"
CONTAINER_NAME="aztec-toolchain"
DOCKER_IMAGE="aztecprotocol/aztec:${AZTEC_VERSION}"

# ── Fix HOME ────────────────────────────────────────────────────────────────
# Claude Cloud runs as root with HOME=/root, but the repo is under /home/user.
# Aztec tooling expects $PWD to be under $HOME.
export HOME="/home/user"
cd "$REPO_DIR"

echo "========================================================"
echo "  Aztec Fee Payment — Claude Cloud Setup"
echo "  Aztec version: ${AZTEC_VERSION}"
echo "========================================================"
echo ""

# ── Step 1: Docker daemon ──────────────────────────────────────────────────
echo "[1/8] Starting Docker daemon..."
if docker info &>/dev/null 2>&1; then
  echo "       Already running."
else
  # gVisor does not support iptables/nftables, overlayfs, or bridge networking.
  #   --iptables=false --ip6tables=false  skip netfilter rules
  #   --bridge=none                       no default bridge (containers use --network=host)
  #   --storage-driver=vfs                simple copy-based storage (only option in gVisor)
  dockerd \
    --iptables=false \
    --ip6tables=false \
    --bridge=none \
    --storage-driver=vfs \
    > /tmp/dockerd.log 2>&1 &

  for i in $(seq 1 30); do
    if docker info &>/dev/null 2>&1; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "FATAL: Docker daemon failed to start after 30s"
      tail -20 /tmp/dockerd.log
      exit 1
    fi
    sleep 1
  done
  echo "       Docker daemon started."
fi

# Aztec wrapper scripts remap localhost → host.docker.internal inside
# containers.  With --network=host this alias must still resolve.
if ! grep -q "host.docker.internal" /etc/hosts 2>/dev/null; then
  echo "127.0.0.1 host.docker.internal" >> /etc/hosts
fi

# ── Step 2: Pull Aztec Docker image ────────────────────────────────────────
echo "[2/8] Pulling Aztec Docker image (may take several minutes on first run)..."
if docker image inspect "${DOCKER_IMAGE}" &>/dev/null 2>&1; then
  echo "       Image already present."
else
  docker pull "${DOCKER_IMAGE}"
  echo "       Image pulled."
fi

# ── Step 3: Persistent toolchain container ─────────────────────────────────
echo "[3/8] Creating persistent toolchain container..."
if docker inspect "${CONTAINER_NAME}" &>/dev/null 2>&1; then
  # Container exists — make sure it's running
  if [ "$(docker inspect -f '{{.State.Running}}' ${CONTAINER_NAME} 2>/dev/null)" != "true" ]; then
    docker start "${CONTAINER_NAME}" >/dev/null
  fi
  echo "       Container already exists and is running."
else
  # Create + start.  The vfs deep-copy happens here (slow, but only once).
  echo "       Creating container (vfs deep-copy — may take 1-2 min)..."
  docker create \
    --name "${CONTAINER_NAME}" \
    --network=host \
    -v /home/user:/home/user \
    -e HOME=/home/user \
    --entrypoint="" \
    "${DOCKER_IMAGE}" \
    tail -f /dev/null >/dev/null

  docker start "${CONTAINER_NAME}" >/dev/null
  echo "       Container created and started."
fi

# Helper: run a command inside the persistent container
run_in_container() {
  docker exec -w "${REPO_DIR}" "${CONTAINER_NAME}" "$@"
}

# ── Step 4: Install aztec CLI wrappers ─────────────────────────────────────
echo "[4/8] Installing aztec CLI wrappers..."
AZTEC_PATH="$HOME/.aztec"
BIN_PATH="$AZTEC_PATH/bin"
mkdir -p "$BIN_PATH"

# ---- aztec (main entrypoint) ----
cat > "$BIN_PATH/aztec" << 'AZTEC_WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="aztec-toolchain"
REPO_DIR="/home/user/aztec-fee-payment"

# Ensure container is running
if [ "$(docker inspect -f '{{.State.Running}}' ${CONTAINER_NAME} 2>/dev/null)" != "true" ]; then
  echo "Error: aztec-toolchain container is not running. Run the setup script first." >&2
  exit 1
fi

case "${1:-}" in
  compile)
    shift
    echo "Compiling contracts..."

    # 1) nargo compile
    docker exec -w "$PWD" "$CONTAINER_NAME" \
      /usr/src/noir/noir-repo/target/release/nargo compile "$@"

    # 2) bb-avm postprocess
    echo "Postprocessing contract..."
    docker exec -w "$PWD" "$CONTAINER_NAME" \
      /usr/src/barretenberg/cpp/build/bin/bb-avm aztec_process

    # 3) Strip internal prefixes
    docker exec -w "$PWD" "$CONTAINER_NAME" \
      /bin/bash -c 'for json in target/*.json; do [ -f "$json" ] && /usr/src/noir-projects/noir-contracts/scripts/strip_aztec_nr_prefix.sh "$json"; done'

    echo "Compilation complete!"
    ;;

  test)
    shift
    # Properly escape all arguments
    args_str=$(printf '%q ' "$@")

    docker exec -w "$PWD" "$CONTAINER_NAME" bash -c "
      node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --txe --port 8081 &
      while ! nc -z 127.0.0.1 8081 &>/dev/null; do sleep 0.2; done
      export NARGO_FOREIGN_CALL_TIMEOUT=300000
      /usr/src/noir/noir-repo/target/release/nargo test --silence-warnings --pedantic-solving --oracle-resolver http://127.0.0.1:8081 $args_str
    "
    ;;

  fmt)
    shift
    docker exec -w "$PWD" "$CONTAINER_NAME" \
      /usr/src/noir/noir-repo/target/release/nargo fmt "$@"
    ;;

  start)
    shift
    # Forward all args to the aztec node CLI
    docker exec -w "$PWD" "$CONTAINER_NAME" bash -c "
      if echo \"\$*\" | grep -q -- '--local-network'; then
        anvil --host 0.0.0.0 --silent &
        node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start \"\$@\"
      else
        node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start \"\$@\"
      fi
    " -- "$@"
    ;;

  codegen)
    shift
    docker exec -w "$PWD" "$CONTAINER_NAME" \
      node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js codegen "$@"
    ;;

  *)
    # All other subcommands → delegate to the Node.js CLI
    docker exec -w "$PWD" "$CONTAINER_NAME" \
      node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js "$@"
    ;;
esac
AZTEC_WRAPPER

chmod +x "$BIN_PATH/aztec"

# ---- aztec-up (no-op in Claude Cloud — version is pinned) ----
cat > "$BIN_PATH/aztec-up" << 'AZTECUP_WRAPPER'
#!/usr/bin/env bash
echo "aztec-up is not needed in Claude Cloud (version pinned to container image)."
AZTECUP_WRAPPER
chmod +x "$BIN_PATH/aztec-up"

echo "$AZTEC_VERSION" > "$AZTEC_PATH/default_version"
export PATH="$BIN_PATH:$PATH"
echo "       Wrappers installed at $BIN_PATH"

# Verify the CLI works
ACTUAL_VERSION=$(run_in_container node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js --version 2>/dev/null || echo "unknown")
echo "       Aztec CLI version: ${ACTUAL_VERSION}"

# ── Step 5: Install Node.js dependencies ───────────────────────────────────
echo "[5/8] Installing Node.js dependencies..."
corepack enable 2>/dev/null || true
if [ -d "node_modules" ] && [ -f "node_modules/.yarn-integrity" ]; then
  echo "       node_modules already present, verifying..."
  yarn install --frozen-lockfile --check-files 2>&1 | tail -1
else
  yarn install --frozen-lockfile
fi
echo "       Dependencies installed."

# ── Step 6: Compile Noir contracts ─────────────────────────────────────────
echo "[6/8] Compiling Noir contracts..."
aztec compile
echo "       Contracts compiled."

# ── Step 7: Generate TypeScript bindings ───────────────────────────────────
echo "[7/8] Generating TypeScript bindings..."
aztec codegen target --outdir src/ts/artifacts -f
echo "       Bindings generated."

# ── Step 8: Build TypeScript package ───────────────────────────────────────
echo "[8/8] Building TypeScript package..."
yarn workspace @defi-wonderland/aztec-fee-payment build
echo "       TypeScript built."

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "========================================================"
echo "  Setup complete!"
echo "========================================================"
echo ""
echo "Available commands:"
echo "  yarn test:agent    Agent unit tests   (no sandbox needed)"
echo "  yarn test:nr       Noir unit tests    (runs in container)"
echo "  yarn test:js       JS integration     (auto-starts sandbox)"
echo "  yarn test          All tests"
echo "  yarn agent:dev     Off-chain agent dev server"
echo ""
echo "For new shell sessions, run:"
echo "  export HOME=/home/user"
echo "  export PATH=$BIN_PATH:\$PATH"
echo ""
echo "The persistent container '${CONTAINER_NAME}' stays running."
echo "To stop it:   docker stop ${CONTAINER_NAME}"
echo "To restart it: docker start ${CONTAINER_NAME}"
echo ""
