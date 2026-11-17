# Run the real generation agent

The browser is only the control surface. Heavy AI generation runs in cloud providers through the Node service.

## 1. Configure environment

The service reads configuration from **environment variables**, not from a `.env` file automatically.

- **Render:** set variables in the service's Environment settings (see `render.yaml`).
- **Local:** copy `.env.example` to `.env`, fill in the keys you need, then start with
  `npm run start:local` (which runs `node --env-file=.env bootstrap.js`).
  Plain `npm start` will not load `.env`.

Minimum credentials for real generation/evaluation:

- `GEMINI_API_KEY` — Google image generation and Gemini visual evaluation
- `QWEN_CLOUD_API_KEY` (or `DASHSCOPE_API_KEY`) — Wan 2.7 video generation with `VIDEO_PROVIDER=qwencloud`
- `MINDSCAPE_API_KEY` — required before exposing the API publicly; without it all mutating routes are open

Optional evaluation switches: `ENABLE_VISUAL_EVALUATION=true`, `ENABLE_AUTO_CORRECTION=true`.

Never commit provider keys to GitHub. `.env` is ignored by git.

## 2. Start the service

Requires Node.js 20+.

```bash
npm install
npm run start:local   # local, loads .env
# or: npm start       # uses variables already exported in the shell / Render
```

Useful endpoints:

- `GET /health` — liveness and storage/auth status
- `GET /ready` — provider and storage readiness (503 when credentials are missing)
- `POST /jobs` — create a generation job
- `GET /jobs`, `GET /jobs/:id` — list / read jobs
- `POST /jobs/:id/retry` — retry a job
- `POST /visual-evaluate` — manual visual evaluation

## 3. Architecture

Director prompt → Shot Contract → specialist contracts → model router → async generation job → result → evaluator → retry.

Providers are asynchronous: the service submits a job, polls task status, and only marks a job complete once real media is returned. Uploaded reference images are stored in a short-lived temp location; generated media is stored under `PERSISTENT_STORAGE_DIR/generated` (or `generated/` when unset).

## 4. Important limitation

"Without limits" cannot literally mean unlimited compute or provider usage. Generation is constrained by provider availability, model capabilities, API quotas and cost. The agent is provider-agnostic so additional providers/models can be added rather than locking the studio to one service.

## 5. Production hardening still needed

For public deployment, add persistent storage, rate limiting, job cancellation, signed webhook verification, and per-user access control. Keep `MINDSCAPE_API_KEY` set, and restrict `ALLOWED_ORIGIN` to your dashboard origin rather than `*`.

## 6. Optional persistent storage

Local writes are always checked, but the service only reports storage as *persistent* when:

- an S3-compatible object store is configured and verified (`OBJECT_STORAGE_*`), or
- `PERSISTENT_STORAGE_DIR` points under `/var/data` **and** `STORAGE_PERSISTENCE_ENABLED=true`.

On platforms without a `/var/data` mount (for example Termux), storage is reported as `ephemeral` even though files remain on device between restarts.

For Cloudflare R2 or another S3-compatible store, create a bucket and a read/write API token, then set:

- `OBJECT_STORAGE_ENDPOINT`: `https://<account-id>.r2.cloudflarestorage.com`
- `OBJECT_STORAGE_BUCKET`: bucket name
- `OBJECT_STORAGE_ACCESS_KEY_ID`: R2 S3 access-key ID
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`: matching secret access key
- `OBJECT_STORAGE_REGION`: `auto`
- `OBJECT_STORAGE_PREFIX`: `mindscape-studio`

At startup the service verifies signed read/write access and restores generation history and metadata from the bucket. New metadata and generated media are backed up to it, and generated URLs can be served from object storage after the local cache is empty. If these variables are absent, the agent continues with the local filesystem. Review current provider pricing and set usage alerts before production use.
