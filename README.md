# Mindscape Studio — Animation Director Agent

Cloud-first, mobile-first animation orchestration app. The phone is only the control surface; generation runs on cloud providers.

## Current architecture

`Director → Shot Contract → Style Bible + Master Asset Contract → Model Router → Generator → Multimodal Evaluator → Error/Performance Memory`

Current providers:

- **Assets/images:** Google Nano Banana 2 (`gemini-3.1-flash-image`)
- **Image → Video:** Hugging Face ZeroGPU Wan 2.2 Space
- **Visual evaluation:** Google Gemini 3.8 Flash (`gemini-3.8-flash`)

Gemini 3.8 Flash is used as the evaluator because it accepts text, image and video inputs, supports structured outputs, and is currently available at a relatively low API cost. Google documents a 1M-token context window and video understanding for the model. The evaluator remains provider-agnostic so a future vision model can replace it without changing Mindscape's evaluation schema.

The browser does not render video. It sends a small JSON request to the server, so low-end phones can operate the system.

## Deploy

The repository includes `render.yaml` for Render.

Required secrets:

- `GEMINI_API_KEY` — Nano Banana 2 and Gemini visual evaluator
- `HF_TOKEN` — optional/authentication for the free Hugging Face video route when required

Never commit provider keys to GitHub. Add them to the Render service's Environment settings.

## Local

Requires Node.js 20+.

```bash
npm install
npm start
```

Open `http://localhost:8787`.

## Visual evaluation

Every successfully generated job is automatically sent to the configured visual evaluator. The evaluator compares the output against the project Style Bible and selected Master Asset and records structured findings for:

- character identity and proportions
- clothing
- palette and rendering style
- shading and texture
- environment and lighting
- camera
- motion

The evaluator returns scores, confidence, expected vs observed values and standardized error codes. A generation completing successfully is not automatically treated as visually approved.

Manual evaluation is also available through `POST /visual-evaluate`.

## Model replacement principle

The application does not treat any generation or evaluation model as the product itself. Providers are selected by server-side adapters and the core records model/provider/version alongside every result. Future models can replace the current providers without redesigning the Mindscape core.

## Important

Real generation and evaluation require provider credentials and provider quotas/billing where applicable. The goal is that the **device does not become the bottleneck**: the phone sends a small job and cloud infrastructure performs the heavy computation.
