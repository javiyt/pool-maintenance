# Deployment: Pool Maintenance on Raspberry Pi

This directory contains everything needed to deploy the Pool Maintenance web app
on a Raspberry Pi (or any Linux host) using **Podman Quadlets** and
**systemd user services**.

## Architecture

```
Developer machine              Raspberry Pi (target)
┌──────────────────┐           ┌─────────────────────────┐
│  GitHub Actions  │──push──>  │  ghcr.io/javiyt/        │
│  builds image    │    to     │  pool-maintenance:latest│
│  on main push    │   GHCR    │                         │
└──────────────────┘           │  Podman Quadlet pulls   │
                               │  image & runs container │
  ./deploy/deploy.sh           │  systemd user service   │
  ──────────────────ssh──────> │  manages lifecycle      │
                               └─────────────────────────┘
```

## Image

Images are hosted on **GitHub Container Registry (GHCR)**:

| Tag | Description |
|---|---|
| `ghcr.io/javiyt/pool-maintenance:latest` | Latest build from `main` branch |
| `ghcr.io/javiyt/pool-maintenance:<sha>` | Specific commit (e.g. `a1b2c3d`) |
| `ghcr.io/javiyt/pool-maintenance:<version>` | Tagged release (e.g. `2.0.0`) |

Builds run automatically on every push to `main` via the
[Container workflow](../.github/workflows/container.yml).
Both `linux/amd64` and `linux/arm64` architectures are built, so the same image
works on x86_64 desktops and ARM64 Raspberry Pis.

## Prerequisites (Raspberry Pi)

1. **Podman** installed:
   ```bash
   sudo apt update && sudo apt install podman
   ```

2. **User linger** enabled (so the service stays running after you log out):
   ```bash
   sudo loginctl enable-linger "$USER"
   ```

3. **GHCR authentication** (only if the package is private):
   ```bash
   podman login ghcr.io
   ```
   If the repository is public (default), authentication is not required for
   pulling the image.

## Deploy from Developer Machine

The easiest way is using `deploy.sh` from your development machine:

```bash
# Basic usage
./deploy/deploy.sh --host 192.168.1.100 --user pi

# With custom SSH key and port
./deploy/deploy.sh --host poolpi.local --user pi --key ~/.ssh/id_rsa --port 2222

# Custom container host port (default: 8090)
./deploy/deploy.sh --host 192.168.1.100 --user pi --app-port 9090
```

The script accepts either CLI flags or environment variables:

| Flag | Env var | Default | Description |
|---|---|---|---|
| `--host HOST` | `REMOTE_HOST` | — | Raspberry Pi IP or hostname |
| `--user USER` | `REMOTE_USER` | — | SSH user |
| `--port PORT` | `SSH_PORT` | `22` | SSH port |
| `--key PATH` | `SSH_KEY` | auto | SSH private key path |
| `--app-port PORT` | `HOST_PORT` | `8090` | Container host port |

### What deploy.sh does

1. Connects to the Raspberry Pi over SSH.
2. Copies `install.sh`, `uninstall.sh`, the Quadlet file, and the env example.
3. Runs `install.sh` remotely, which:
   - Creates required directories (`~/.config/containers/systemd/`, `~/pool-maintenance/`).
   - Copies the Quadlet file and patches the `PublishPort` if needed.
   - Creates an `.env` file from the example if none exists.
   - Runs `systemctl --user daemon-reload`.
   - Enables and restarts the service.
   - Pulls the latest image (because `Pull=newer` is set in the Quadlet).

## Manual Install on Raspberry Pi

If you prefer to copy files manually or don't have SSH from your dev machine:

```bash
# On the Raspberry Pi, after cloning or copying the deploy directory
cd deploy
chmod +x install.sh uninstall.sh

# Install with default port (8090)
./install.sh

# Install with custom port
./install.sh --port 9090
```

## Checking Status

```bash
# Service status
systemctl --user status pool-maintenance.service

# Live logs
journalctl --user -u pool-maintenance.service -f

# Container status
podman ps

# Container logs directly
podman logs pool-maintenance
```

## Rolling Back

If a deployment has issues, you can roll back to a specific image tag:

1. **Edit the Quadlet file** to point to a known-good SHA tag:
   ```bash
   nano ~/.config/containers/systemd/pool-maintenance.container
   ```
   Change `Image=ghcr.io/javiyt/pool-maintenance:latest` to:
   ```
   Image=ghcr.io/javiyt/pool-maintenance:a1b2c3d
   ```

2. **Reload and restart**:
   ```bash
   systemctl --user daemon-reload
   systemctl --user restart pool-maintenance.service
   ```

3. **Verify** the rollback:
   ```bash
   systemctl --user status pool-maintenance.service
   journalctl --user -u pool-maintenance.service -n 20
   ```

## Auto-Update

The Quadlet includes `AutoUpdate=registry`, which enables Podman's built-in
auto-update. To manually trigger an update check:

```bash
podman auto-update
```

This will pull a newer `latest` image if available and restart the container
gracefully.

## Uninstall

```bash
# Basic uninstall (preserves env file and container image)
./deploy/uninstall.sh

# Full cleanup (removes env file and image too)
./deploy/uninstall.sh --remove-env --remove-image
```

## Files

| File | Purpose |
|---|---|
| `quadlet/pool-maintenance.container` | Podman Quadlet definition |
| `env/pool-maintenance.env.example` | Example environment file |
| `install.sh` | Install + start the service (run on Pi) |
| `deploy.sh` | Deploy from dev machine via SSH |
| `uninstall.sh` | Stop + remove the service (run on Pi) |
