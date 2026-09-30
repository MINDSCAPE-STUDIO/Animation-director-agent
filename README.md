# Animation Director Agent

A director-first production planning agent for Mindscape Studio. It converts natural-language shot direction into a structured, production-ready **Shot Contract** that downstream animation agents can consume.

## Current version
**v0.1 — Director Agent**

### Workflow
1. Describe a shot in natural language.
2. Generate a structured shot specification.
3. Review the human-readable production brief.
4. Inspect/copy the JSON Shot Contract.
5. Review ambiguities before production.

### Current schema
- `shot_id`
- `duration_seconds`
- `fps`
- `character`
- `action`
- `path`
- `camera`
- `performance.gaze`
- `performance.expression`
- `performance.body_language`
- `background`
- `priorities`
- `acceptance_criteria`
- `ambiguities`

The first implementation is intentionally deterministic and requires no API key. This gives us a stable contract before introducing model routing.

## Roadmap
The architecture is intended to grow into a production agent system:

`Director → Character → Motion → Camera → Background → Generation → Evaluator → Compositor`

Future work will add model/tool routing, persistent projects and assets, generation jobs, retries, visual evaluation, continuity memory, and final scene assembly.

## Run
This first version is a static web app. Open `index.html` in a browser or deploy the repository with GitHub Pages/another static host.
