# Mindscape Studio — Animation Director Agent

Cloud-first, mobile-first animation orchestration app. The phone is only the control surface; generation runs on cloud providers.

## What it does

Describe a shot in normal language. The app converts the direction into a Shot Contract, routes generation jobs through a model router, and keeps image assets and video generation as separate replaceable capabilities.

## Current architecture

`Director → Shot Contract → Model Router → Asset/Image Provider or Video Provider → Evaluator`

Current providers:

- **Assets/images:** Google Nano Banana 2 (`gemini-3.1-flash-image`)
- **Image → Video:** Hugging Face ZeroGPU Wan 2.2 Space
- Additional provider routes remain replaceable through environment variables.

The browser does not render video. It sends a small JSON request to the server, so low-end phones can operate the system.

## Deploy

The repository includes `render.yaml` for Render.

Required secret for Nano Banana 2:

- `GEMINI_API_KEY`

Required secret for the free Hugging Face video route when authentication is needed:

- `HF_TOKEN`

Never commit provider keys to GitHub. Add them to the Render service's Environment settings.

## Local

Requires Node.js 20+.

```bash
npm install
npm start
```

Open `http://localhost:8787`.

## Mobile design

- No client-side video rendering.
- No heavy frontend framework.
- Cacheable static assets.
- PWA manifest/service worker included.
- 480p preview default for video.
- Asynchronous generation.
- Bounded lightweight polling.
- Reference images can be uploaded directly from a phone.

## Model replacement principle

The application does not treat any generation model as the product itself. Image and video providers are selected by the server-side model router so future models can replace the current providers without redesigning the Mindscape core.

## Important

Real generation requires provider credentials and provider quotas/billing where applicable. The goal is that the **device does not become the bottleneck**: the phone sends a small job and cloud infrastructure performs the heavy computation.
