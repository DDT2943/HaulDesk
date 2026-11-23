# HaulDesk Server Deployment & Safe Upgrade Guide

This guide covers self-hosting HaulDesk with Docker Compose and **safely upgrading an existing production instance** without losing `hauldesk-db.json` or breaking reverse-proxy port mappings (such as an Nginx upstream pointing to `127.0.0.1:3003`).

---

## Important Security Prerequisite

HaulDesk does not include multi-user authentication. If your server is reachable over the public internet:
- Keep Docker bound strictly to `127.0.0.1` (default in `docker-compose.yml`).
- Place an authenticated reverse proxy in front (Nginx/Caddy with HTTP Basic Auth, Authelia, Cloudflare Access, or Tailscale).

---

## Preserving Existing Production Port Mappings (`3003` -> `3000`)

The open-source `docker-compose.yml` defaults host port binding to `127.0.0.1:${HAULDESK_HOST_PORT:-3000}:3000` so new users reach HaulDesk on `localhost:3000`.

**If your existing reverse proxy expects HaulDesk on port `3003`**, make sure `.env` in your server's deployment directory contains:

```env
HAULDESK_HOST_PORT=3003
DATA_DIR=/app/data
```

Also note that `Dockerfile` now uses `node:22-bookworm-slim` (instead of Alpine) because `onnxruntime-node` links against `glibc` for local background removal. All existing `./data/hauldesk-db.json` files remain 100% compatible.

---

## Copy-Paste SSH Upgrade Workflow (Existing Server)

Replace `<APP_DIR>` with the path to your HaulDesk folder on the server (check with `docker inspect hauldesk --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'`).

### 1. Connect & Inspect Running Container + Data Backup
```bash
ssh <USER>@<YOUR_SERVER_IP>

# Find your existing Compose working directory automatically
docker inspect hauldesk --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'

cd <APP_DIR>

# Verify current port mapping and data file before touching anything
docker ps --filter name=hauldesk
ls -lh data/

# Create a timestamped backup of your entire data directory (and download/store safely)
mkdir -p backups
cp -a data/ "backups/data-$(date +%Y%m%d-%H%M%S)"
ls -lh backups/
```

*(Bonus safety: Also click **Export JSON** inside the live HaulDesk web UI to save a copy to your personal computer before upgrading.)*

### 2. Preserve Your Existing Port (`3003`) & Env Config
```bash
# Check if your running container or Nginx uses port 3003
docker port hauldesk || true

# Create .env from template if missing, and pin HAULDESK_HOST_PORT=3003 if your proxy expects 3003
if [ ! -f .env ]; then
  cp .env.example .env
fi

# Set HAULDESK_HOST_PORT=3003 (skip or set to 3000 if your proxy targets 3000)
grep -q '^HAULDESK_HOST_PORT=' .env \
  && sed -i 's/^HAULDESK_HOST_PORT=.*/HAULDESK_HOST_PORT=3003/' .env \
  || echo 'HAULDESK_HOST_PORT=3003' >> .env

# Ensure your reverse-proxy origin is trusted by CORS (replace with your real domain)
# echo 'APP_URL="https://hauldesk.yourdomain.com"' >> .env
```

### 3. Pull Latest Release Code & Rebuild Safely
```bash
# Record current commit hash for instant rollback if needed
git rev-parse HEAD > backups/previous-commit.txt

# Pull latest code (use `git pull --ff-only` if working tree is clean)
git pull --ff-only

# Rebuild image and recreate container while preserving ./data:/app/data
docker compose up -d --build
```

### 4. Verify the Upgrade
```bash
# Check container health and startup logs
docker compose ps
docker compose logs --tail=50 hauldesk

# Verify HTTP health & state API locally on the preserved host port (3003)
curl -sf http://127.0.0.1:3003/api/health && echo ""
curl -sf http://127.0.0.1:3003/api/state | head -c 200 && echo ""

# Verify Firefox extension download route
curl -sI http://127.0.0.1:3003/hauldesk-quickadd.xpi | head -n 5
```

Confirm in your browser that your orders, item photos, ratings, and saved drafts are all visible and that your reverse proxy URL loads cleanly.

---

## Rollback Procedure (If Anything Goes Wrong)

```bash
cd <APP_DIR>

# 1. Restore previous Git commit (replace with hash from backups/previous-commit.txt if needed)
git checkout "$(cat backups/previous-commit.txt)"

# 2. Restore backed-up JSON state ONLY if data was modified/corrupted
# cp -a backups/data-<TIMESTAMP>/* data/

# 3. Rebuild previous container version
docker compose up -d --build
```

---

## Fresh Docker Setup (New Users)

```bash
git clone https://github.com/DDT2943/HaulDesk.git
cd HaulDesk
cp .env.example .env
docker compose up -d --build
curl -sf http://127.0.0.1:3000/api/health
```
