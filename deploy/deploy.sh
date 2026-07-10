#!/usr/bin/env bash
#
# deploy.sh — Deploy pool-maintenance to a remote Raspberry Pi.
#
# Runs from a developer machine. Copies deployment files to the target host
# over SSH and triggers the remote install to pull the latest image and restart
# the service.
#
# Usage:
#   ./deploy.sh [options]
#
# Options:
#   --host HOST      Remote host (IP or hostname)         [default: $REMOTE_HOST]
#   --user USER      SSH user                             [default: $REMOTE_USER]
#   --port PORT      SSH port                             [default: $SSH_PORT or 22]
#   --key PATH       SSH private key path                 [default: auto]
#   --app-port PORT  Container host port                  [default: 8090]
#   --help           Show this help
#
# Environment variables (alternative to CLI flags):
#   REMOTE_HOST   Remote hostname or IP
#   REMOTE_USER   SSH user
#   SSH_PORT      SSH port (default: 22)
#   SSH_KEY       Path to SSH private key
#   HOST_PORT     Container host port (default: 8090)
#
# Prerequisites on the Raspberry Pi:
#   - Podman installed
#   - Linger enabled: sudo loginctl enable-linger <user>
#   - Logged in to GHCR if package is private: podman login ghcr.io
# =============================================================================

set -euo pipefail

# ---- Colors ---------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- Config ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE_DIR="pool-maintenance"

REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-}"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY:-}"
HOST_PORT="${HOST_PORT:-8090}"

# ---- Parse args -----------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --host) REMOTE_HOST="$2"; shift 2 ;;
        --user) REMOTE_USER="$2"; shift 2 ;;
        --port) SSH_PORT="$2"; shift 2 ;;
        --key)  SSH_KEY="$2";   shift 2 ;;
        --app-port) HOST_PORT="$2"; shift 2 ;;
        --help)
            echo "Usage: $0 [--host HOST] [--user USER] [--port PORT] [--key PATH] [--app-port PORT]"
            exit 0 ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

# ---- Validate -------------------------------------------------------------
if [ -z "$REMOTE_HOST" ]; then
    error "Remote host is required. Set --host or REMOTE_HOST."
    echo "Usage: $0 --host 192.168.1.100 --user pi"
    exit 1
fi

if [ -z "$REMOTE_USER" ]; then
    error "Remote user is required. Set --user or REMOTE_USER."
    exit 1
fi

# Build SSH options
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o LogLevel=ERROR)
if [ -n "$SSH_KEY" ]; then
    SSH_OPTS+=(-i "$SSH_KEY")
fi
SSH_OPTS+=(-p "$SSH_PORT")
SSH_DEST="${REMOTE_USER}@${REMOTE_HOST}"

# ---- Check connectivity ---------------------------------------------------
info "Checking connectivity to ${REMOTE_HOST}..."
ssh "${SSH_OPTS[@]}" "$SSH_DEST" "echo OK" || {
    error "Cannot connect to ${REMOTE_HOST}. Verify the host, user, and SSH key."
    exit 1
}
ok "Connected to ${REMOTE_HOST}"

# ---- Copy files to remote -------------------------------------------------
info "Copying deploy files to ${REMOTE_HOST}:${REMOTE_DIR}/..."
ssh "${SSH_OPTS[@]}" "$SSH_DEST" "mkdir -p ${REMOTE_DIR}/quadlet ${REMOTE_DIR}/env"

scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/install.sh"      "${SSH_DEST}:${REMOTE_DIR}/"
scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/uninstall.sh"    "${SSH_DEST}:${REMOTE_DIR}/"
scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/quadlet/pool-maintenance.container" "${SSH_DEST}:${REMOTE_DIR}/quadlet/"
scp "${SSH_OPTS[@]}" "$SCRIPT_DIR/env/pool-maintenance.env.example"   "${SSH_DEST}:${REMOTE_DIR}/env/"
ok "Files copied"

# ---- Run remote install ---------------------------------------------------
info "Running install script on remote host (port ${HOST_PORT}:80)..."
ssh "${SSH_OPTS[@]}" "$SSH_DEST" "cd ${REMOTE_DIR} && bash install.sh --port ${HOST_PORT}"

echo ""
ok "Deploy complete!"
echo ""
info "Quick status:"
echo "  ssh ${SSH_DEST} 'systemctl --user status pool-maintenance.service --no-pager'"
echo "  ssh ${SSH_DEST} 'journalctl --user -u pool-maintenance.service -f'"
echo ""
