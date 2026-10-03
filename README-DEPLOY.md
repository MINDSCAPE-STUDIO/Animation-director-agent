# Development and deployment

Mindscape Studio has a browser director interface and a Node.js service. The browser submits generation jobs; providers run from the server-side model router.

## Local setup

Requires Node.js 20 or later.

1. Copy `.env.example` to `.env` and add provider credentials locally. Do not commit `.env`.
2. Install dependencies with `npm install`.
3. Start the service with `npm start` and open `http://localhost:8787`.

`GEMINI_API_KEY` is required for the visual evaluator and for image generation when `IMAGE_PROVIDER=google`. `HF_TOKEN` is optional for public Hugging Face Spaces, but may be needed for authenticated access or higher limits. `REPLICATE_API_TOKEN` and `FAL_KEY` are used only when their corresponding routes are selected.

## Current provider routing

- Images use Google Gemini when `IMAGE_PROVIDER=google`; otherwise they use the configured Hugging Face image Space (the `.env.example` default).
- Video uses the configured Hugging Face Space when `VIDEO_PROVIDER=hf_space` (the `.env.example` default). That route currently supports image-to-video and requires a reference image. The alternative `fal` and default Replicate routes require their own credentials.
- Visual evaluation uses the Google Gemini API. `VISION_MODEL` selects the Gemini model, and evaluation requires `GEMINI_API_KEY`.

Render's `render.yaml` currently selects Google image generation and Hugging Face video generation. Add the required secrets in the Render service's Environment settings; the Blueprint declares secret values as unsynchronized. This guide does not ask you to deploy or change Render settings.

## Service endpoints

- `GET /health` — service health and configured route names
- `POST /jobs`, `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/retry` — generation jobs. The dashboard polls job status until the selected provider returns a terminal result.
- `GET /generation-history` — append-only local history
- `GET` and `PATCH /style-bible` — project style contract
- `GET` and `POST /master-assets`, `GET` and `PATCH /master-assets/:id`, `POST /master-assets/:id/approve` — master assets
- `GET` and `POST /evaluations`, `POST /visual-evaluate` — evaluation records and visual evaluation
- `GET /error-taxonomy` — supported error codes

## Current operational limits

The queue is held in process memory. Style Bible, Master Assets, evaluations, and generation history are written to local files; generated outputs are also stored under the app directory. These files can be lost on service restart or deployment when the host does not provide persistent storage. The service has no user authentication or request rate limiting, so it is not hardened for unrestricted public use. The Render Blueprint uses a free web service and automatic deployment; verify the connected branch and service settings in Render before relying on production behavior.

Replicate and fal jobs are asynchronous: the server stores the provider request, polls its status when the dashboard requests the job, and only evaluates the generation after completion. Synchronous Google and Hugging Face routes complete in the initial server-side generation call. The code does not implement provider webhooks.
