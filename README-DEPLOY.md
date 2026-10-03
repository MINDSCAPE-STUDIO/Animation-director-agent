# Development and deployment

Mindscape Studio has a browser director interface and a Node.js service. The browser submits generation jobs; providers run from the server-side model router.

## Local setup

Requires Node.js 20.19 or later; the start script reads `.env` using Node's built-in environment-file support.

1. Copy `.env.example` to `.env` and add provider credentials locally. Do not commit `.env`.
2. Install dependencies with `npm install`.
3. Start the service with `npm start` and open `http://localhost:8787`.

`APP_ACCESS_TOKEN` protects the API when configured. Production startup fails closed if it is missing; the browser asks for it and keeps it only for the current tab. Set it as a secret in Render before deploying this branch. `GEMINI_API_KEY` is required for the visual evaluator and for image generation when `IMAGE_PROVIDER=google`. `HF_TOKEN` is optional for public Hugging Face Spaces, but may be needed for authenticated access or higher limits. `REPLICATE_API_TOKEN` and `FAL_KEY` are used only when their corresponding routes are selected.

## Current provider routing

- Images use Google Gemini when `IMAGE_PROVIDER=google`; otherwise they use the configured Hugging Face image Space (the `.env.example` default).
- Video uses the configured Hugging Face Space when `VIDEO_PROVIDER=hf_space` (the `.env.example` default). That route currently supports image-to-video and requires a reference image. The alternative `fal` and default Replicate routes require their own credentials.
- Visual evaluation uses the Google Gemini API. `VISION_MODEL` selects the Gemini model, and evaluation requires `GEMINI_API_KEY`.

Render's `render.yaml` currently selects Google image generation and Hugging Face video generation. Add the required secrets in the Render service's Environment settings; the Blueprint declares secret values as unsynchronized. This guide does not ask you to deploy or change Render settings.

## Service endpoints

- `GET /health` — service/queue-storage health, selected image/video/evaluator routes, credential-presence flags, and whether `APP_DATA_DIR` is set. It never returns credential values. Provider availability is reported as `not_checked`; credentials being configured does not prove a provider is reachable.
- `POST /jobs`, `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/retry` — generation jobs. The dashboard polls job status until the selected provider returns a terminal result.
- `GET /generation-history` — append-only local history
- `GET` and `PATCH /style-bible` — project style contract
- `GET` and `POST /master-assets`, `GET` and `PATCH /master-assets/:id`, `POST /master-assets/:id/approve` — master assets
- `GET` and `POST /evaluations`, `POST /visual-evaluate` — evaluation records and visual evaluation
- `GET /error-taxonomy` — supported error codes

## Current operational limits

The queue is atomically saved to `APP_DATA_DIR/generation-queue.json` (default: `data/`). Provider-backed Replicate and fal jobs with saved request IDs resume polling after a process restart. Jobs whose provider submission state is ambiguous are marked failed with a retry explanation to avoid duplicate provider requests. Style Bible, Master Assets, evaluations, generation history, uploaded references, and generated outputs use `APP_DATA_DIR` when it is configured.

The default Render service uses the free plan, whose filesystem is ephemeral and which does not support persistent disks. To retain queue, project, upload, and output data across Render restarts and deploys, the service needs a paid plan with a persistent disk mounted at a path such as `/var/data`, and `APP_DATA_DIR` must point to that mount. That infrastructure change has not been made. The health endpoint reports whether a data path is explicitly configured, not whether the underlying filesystem is durable. API access is protected when `APP_ACCESS_TOKEN` is configured; Render production refuses to start without it. The service does not include request rate limiting.

Replicate and fal jobs are asynchronous: the server stores the provider request, polls its status when the dashboard requests the job, and only evaluates the generation after completion. Synchronous Google and Hugging Face routes complete in the initial server-side generation call. The code does not implement provider webhooks.
