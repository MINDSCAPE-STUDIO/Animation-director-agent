# Mindscape Studio — Animation Director Agent

Cloud-first, mobile-first animation orchestration app. The phone is only the control surface; generation runs on a cloud provider.

## What it does

Describe a shot in normal language. The app converts the direction into a Shot Contract, runs specialist planning agents, routes a generation job to a cloud model, and polls for the result.

## Architecture

`Director → Shot Contract → Character → Motion → Camera → Background → Model Router → Cloud Generation → Evaluator`

The browser does not render video. It sends a small JSON request to the server, so low-end phones can operate the system.

## Deploy

The repository includes `render.yaml` for Render. Render supports GitHub-connected Node web services and environment variables/secrets through its Dashboard.

1. Open Render and choose **New → Web Service**.
2. Connect GitHub and select `MINDSCAPE-STUDIO/Animation-director-agent`.
3. Use the repository `render.yaml`, or use build command `npm install` and start command `npm start`.
4. Add `REPLICATE_API_TOKEN` as a secret environment variable in the Render service's **Environment** settings. Never commit it to GitHub.
5. Deploy.
6. Open the generated HTTPS URL on any phone, tablet or desktop.

Render's free web services are suitable for initial testing but can spin down after inactivity, so the first request after idle may be slower.

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
- 480p preview default.
- Asynchronous generation.
- Bounded lightweight polling.

## Provider

Default: Replicate.

Default model: `bytedance/seedance-1-pro-fast`. The model can be changed with `VIDEO_MODEL` without modifying the application. A fal.ai route is included for future provider fallback.

## Important

Real generation requires provider credentials and provider billing/quotas. The software cannot make cloud compute literally unlimited. The goal is that the **device does not become the bottleneck**: the phone sends a small job and the cloud performs the heavy computation.
