#!/usr/bin/env bash
#
# uninstall.sh — Remove pool-maintenance Quadlet and stop the service.
#
# Run this script ON the Raspberry Pi (or target host) to stop, disable, and
# remove the pool-maintenance systemd user service and its Quadlet file.
#
# Usage:
#   ./uninstall.sh [--remove-env] [--remove-image]
#
# Options:
#   --remove-env    Delete the env file (~/pool-maintenance/.env)
#   --remove-image  Delete the container image (ghcr.io/javiyt/pool-maintenance)
#   --help          Show this help
#
# By default, the .env file and container image are preserved.
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
QUADLET_FILE="${HOME}/.config/containers/systemd/pool-maintenance.container"
APP_DIR="${HOME}/pool-maintenance"
ENV_FILE="${APP_DIR}/.env"
SERVICE_NAME="pool-maintenance.service"

REMOVE_ENV=false
REMOVE_IMAGE=false

# ---- Parse args -----------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --remove-env)   REMOVE_ENV=true; shift ;;
        --remove-image) REMOVE_IMAGE=true; shift ;;
        --help)
            echo "Usage: $0 [--remove-env] [--remove-image]"
            exit 0 ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

# ---- Stop and disable service ---------------------------------------------
if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "Stopping ${SERVICE_NAME}..."
    systemctl --user stop "$SERVICE_NAME"
    ok "Service stopped"
fi

if systemctl --user is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "Disabling ${SERVICE_NAME}..."
    systemctl --user disable "$SERVICE_NAME"
    ok "Service disabled"
fi

# ---- Remove Quadlet file --------------------------------------------------
if [ -f "$QUADLET_FILE" ]; then
    info "Removing Quadlet file..."
    rm -f "$QUADLET_FILE"
    ok "Quadlet file removed"
else
    info "No Quadlet file found — nothing to remove"
fi

# ---- Reload systemd -------------------------------------------------------
info "Reloading systemd user daemon..."
systemctl --user daemon-reload
ok "Daemon reloaded"

# ---- Remove env file (optional) -------------------------------------------
if [ "$REMOVE_ENV" = true ] && [ -f "$ENV_FILE" ]; then
    info "Removing env file..."
    rm -f "$ENV_FILE"
    ok "Env file removed"
fi

# Remove app directory if empty
if [ -d "$APP_DIR" ]; then
    if [ -z "$(ls -A "$APP_DIR")" ]; then
        rmdir "$APP_DIR"
        ok "App directory removed (was empty)"
    else
        warn "App directory not empty — keeping: ${APP_DIR}"
    fi
fi

# ---- Remove container image (optional) ------------------------------------
if [ "$REMOVE_IMAGE" = true ]; then
    IMAGE="ghcr.io/javiyt/pool-maintenance"
    if podman image exists "$IMAGE" 2>/dev/null; then
        info "Removing container image..."
        podman rmi "$IMAGE" || warn "Could not remove image (may be in use)"
        ok "Container image removed"
    else
        info "No container image found — nothing to remove"
    fi
fi

echo ""
ok "Pool Maintenance has been uninstalled."
if [ "$REMOVE_ENV" = false ]; then
    warn "The env file was preserved: ${ENV_FILE}"
    warn "Re-run with --remove-env to delete it."
fi
if [ "$REMOVE_IMAGE" = false ]; then
    warn "The container image was preserved."
    warn "Re-run with --remove-image to delete it."
fi
echo ""
