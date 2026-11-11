# CodyNex OS — Deployment, Backup & Recovery Runbook

## 1. Zero-Cost Production Topology
- **Frontend (`dashboard/`)**: Netlify Free Tier (`dashboard/netlify.toml`) deployed via `.github/workflows/deploy-netlify.yml`.
- **Database**: Neon.tech or Supabase Free Tier PostgreSQL (TLS enabled automatically in `psqlDb.config.ts`).
- **Backend (`backend/`)**: Node.js `v20+` (`npm run build && npm start`), compatible with cPanel/Phusion Passenger (`app.js`, `ecosystem.config.cjs`), Docker (`Dockerfile`), or Render/Fly/VPS.
- **Cloud Execution (Laptop Off)**:
  - Option A (Persistent host): Set `ENABLE_WORKERS=true` in `.env`.
  - Option B (Serverless/Passenger host): Deploy `cloudflare-worker/` with a 1-minute Cron Trigger calling `POST https://<api-host>/api/v1/codynex/workers/tick` authenticated with `X-Worker-Secret`, plus `.github/workflows/worker-heartbeat.yml` as a secondary 5-minute heartbeat.

## 2. Database Migrations & Seeding
```bash
cd backend
npm run migration:run
npm run seed
```
Set `CEO_EMAIL`, `CEO_PASSWORD`, and `CEO_NAME` in `.env` before running `npm run seed` in production.

## 3. Backups & Restoration
- **Automated logical backup** (run via cron or GitHub Actions):
  ```bash
  pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f "codynex_backup_$(date +%F).dump"
  ```
- **Restoration drill**:
  ```bash
  pg_restore --clean --if-exists --no-owner --dbname="$TARGET_DATABASE_URL" codynex_backup_YYYY-MM-DD.dump
  ```
- **Settings snapshot export**: Available directly in Dashboard -> Settings -> Export Configuration Snapshot (excludes encrypted secret ciphertexts unless explicitly exported).

## 4. Rollback Procedure
1. Revert to previous immutable Git commit / Docker tag (`IMAGE_TAG=<prev-sha>`).
2. If a migration introduced a regression, run `npm run migration:revert` before starting the previous build.
3. Verify `/health` and `/health/ready` return HTTP `200`.
