# Mindscape Animation Director Agent

A lightweight, cloud-first animation production agent. The browser is only the control surface; planning and generation run on the server/provider, so low-end phones do not render video locally.

## Current architecture
`Director → Character → Motion → Camera → Background → Model Router → Cloud Generation → Polling → Output`

## What works now
- Natural-language shot planning
- Structured Shot Contract
- Specialist production contracts
- Text-to-video and image-to-video job routing
- Replicate default provider with Seedance 1 Pro Fast
- Optional fal.ai provider
- Async cloud jobs
- Result polling
- Retry support
- Server-side provider credentials
- Mobile-first lightweight UI
- PWA/offline UI cache
- No frontend framework or dependency-heavy build
- Render deployment configuration

The default video route uses Replicate's official `bytedance/seedance-1-pro-fast`, which supports text-to-video and image-to-video. Duration is bounded to the model's supported range and preview quality defaults to 480p for faster/cheaper iteration. Final 1080p can be selected from the UI. citeturn1search11turn1search1

## Deploy
1. Create a Render Web Service from this repository.
2. Render detects `render.yaml`.
3. Add `REPLICATE_API_TOKEN` as a secret environment variable.
4. Deploy.
5. Open the generated service URL on any phone, tablet or computer.

The app serves its own UI and API from one Node service, so there is no localhost URL to configure on the phone.

## Local
Requires Node 20+.

```bash
npm start
```

Then open `http://localhost:8787`.

## Important
Provider compute and generation quotas/costs still apply. The goal is that the **device does not become the bottleneck**: the phone sends a small JSON job and the cloud does the heavy work.
