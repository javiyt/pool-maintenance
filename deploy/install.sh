#!/usr/bin/env bash
#
# install.sh — Install pool-maintenance Quadlet on a Raspberry Pi.
#
# Run this script ON the Raspberry Pi (or target host) after cloning or copying
# the deploy directory. It copies the Quadlet file, sets up directories, and
# starts the systemd user service.
#
# Usage:
#   ./install.sh [--port PORT]
#
# Options:
#   --port PORT   Host port to map to container port 80 (default: 8090)
#   --help        Show this help
#
# Environment:
#   HOST_PORT     Alternative to --port (lower priority)
#
# Prerequisites:
#   - Podman installed
#   - User has permission to run systemd user services
#   - Linger enabled: sudo loginctl enable-linger "$USER"
#   - Logged in to GHCR if the package is private:
#       podman login ghcr.io
# =============================================================================

set -euo pipefail

# ---- Colors ---------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- Config ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUADLET_SRC="$SCRIPT_DIR/quadlet/pool-maintenance.container"
ENV_EXAMPLE="$SCRIPT_DIR/env/pool-maintenance.env.example"

QUADLET_DIR="${HOME}/.config/containers/systemd"
APP_DIR="${HOME}/pool-maintenance"
QUADLET_DEST="${QUADLET_DIR}/pool-maintenance.container"
ENV_DEST="${APP_DIR}/.env"

HOST_PORT="${HOST_PORT:-8090}"

# ---- Parse args -----------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)
            HOST_PORT="$2"; shift 2 ;;
        --help)
            echo "Usage: $0 [--port PORT]"
            exit 0 ;;
        *)
            error "Unknown option: $1"
            exit 1 ;;
    esac
done

# ---- Validate -------------------------------------------------------------
if [ ! -f "$QUADLET_SRC" ]; then
    error "Quadlet file not found: $QUADLET_SRC"
    exit 1
fi

command -v podman >/dev/null 2>&1 || {
    error "Podman is not installed. Install it first:"
    error "  sudo apt install podman   # Debian/Ubuntu"
    error "  brew install podman       # macOS (not applicable on Pi)"
    exit 1
}

# ---- Create directories ---------------------------------------------------
info "Creating directories..."
mkdir -p "$QUADLET_DIR"
mkdir -p "$APP_DIR"
ok "Directories ready"

# ---- Install Quadlet file -------------------------------------------------
info "Installing Quadlet file (port ${HOST_PORT}:80)..."
cp "$QUADLET_SRC" "$QUADLET_DEST"

# Patch the PublishPort if it differs from the default
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/PublishPort=[0-9]*:80/PublishPort=${HOST_PORT}:80/" "$QUADLET_DEST"
else
    sed -i "s/PublishPort=[0-9]*:80/PublishPort=${HOST_PORT}:80/" "$QUADLET_DEST"
fi
ok "Quadlet installed: $QUADLET_DEST"

# ---- Install env file -----------------------------------------------------
if [ ! -f "$ENV_DEST" ]; then
    info "No .env file found — creating from example..."
    cp "$ENV_EXAMPLE" "$ENV_DEST"
    warn ".env created from example — edit $ENV_DEST if needed"
else
    info ".env file already exists — keeping it"
fi

# ---- Reload and enable service --------------------------------------------
info "Reloading systemd user daemon..."
systemctl --user daemon-reload
ok "Daemon reloaded"

info "Enabling pool-maintenance service..."
systemctl --user enable pool-maintenance.service
ok "Service enabled"

info "Starting pool-maintenance service..."
systemctl --user restart pool-maintenance.service || {
    warn "Service failed to start. Checking status..."
    systemctl --user status pool-maintenance.service --no-pager || true
    journalctl --user -u pool-maintenance.service -n 20 --no-pager || true
    warn "See above for error details. Check: systemctl --user status pool-maintenance.service"
    exit 1
}
ok "Service started"

# ---- Check linger ---------------------------------------------------------
LINGER_STATE=$(loginctl show-user "$USER" --property=Linger 2>/dev/null || echo "Linger=no")
if [[ "$LINGER_STATE" != "Linger=yes" ]]; then
    warn "User linger is not enabled. The service will stop when you log out."
    warn "  Run: sudo loginctl enable-linger $USER"
fi

# ---- Status summary -------------------------------------------------------
echo ""
info "=============================================="
ok "  Pool Maintenance installed successfully!"
info "=============================================="
echo ""
info "Service status:"
systemctl --user status pool-maintenance.service --no-pager 2>&1 | head -10
echo ""
info "View logs:   journalctl --user -u pool-maintenance.service -f"
info "Check image: podman images ghcr.io/javiyt/pool-maintenance"
info "Stop:        systemctl --user stop pool-maintenance.service"
info "Disable:     systemctl --user disable pool-maintenance.service"
info "Uninstall:   ${SCRIPT_DIR}/uninstall.sh"
echo ""
