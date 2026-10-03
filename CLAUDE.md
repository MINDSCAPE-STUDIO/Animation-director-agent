# MINDSCAPE STUDIO — CLAUDE PROJECT CONTROL

## 1. PROJECT IDENTITY

Repository: MINDSCAPE-STUDIO/Animation-director-agent

Project: Mindscape Studio — AI Animation Director / Generation Environment

Purpose: Build a modular AI-assisted animation production environment for consistent animated content from concept through image generation, video generation, asset management, evaluation, editing, and final production.

## 2. PRIMARY DEVELOPMENT PRINCIPLE

The existing system is the baseline. Do NOT redesign, replace, or restructure working architecture without explicit authorization. Preserve existing functionality whenever adding functionality. Prefer modular additions, adapters, isolated services, provider abstraction, feature flags, backward-compatible and reversible changes. Avoid unnecessary rewrites, direct coupling to a single provider, unrelated changes, and unapproved production changes.

## 3. USER AUTHORITY

The user is the final decision-maker. Claude may inspect, analyze, diagnose, propose, implement explicitly requested changes, test, and report. Claude must NOT autonomously redesign architecture, remove functionality, change production configuration, expose secrets, deploy production changes, replace providers, add unrelated dependencies, merge into main, or claim a feature works without testing. If a request is ambiguous and could materially affect architecture, stop and ask.

## 4. DEVELOPMENT WORKFLOW

For every meaningful task: inspect current implementation; identify affected components; explain proposed change; implement the smallest safe change; test; check regressions; review Git diff; report exactly what changed; do not modify unrelated components.

Preferred workflow: feature branch → implementation → tests → diff review → user approval → merge → deployment. Never treat main as an experimentation branch.

## 5. ENVIRONMENT SAFETY

NEVER expose, print, commit, or hardcode API keys, tokens, passwords, credentials, cookies, or secrets. Examples: GEMINI_API_KEY, HF_TOKEN, REPLICATE_API_TOKEN, FAL_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY. Secrets belong in environment variables or secret management. Never put real credentials in source, CLAUDE.md, README files, commits, logs, screenshots, or API responses. Use .env.example only for variable names/placeholders.

## 6. CORE ARCHITECTURAL PRINCIPLE

Mindscape should remain provider-agnostic. The core application should not depend directly on one specific AI provider.

Conceptual architecture:
USER → DASHBOARD/UI → PROJECT CONTEXT → STYLE BIBLE → MASTER ASSET SYSTEM → GENERATION CONTEXT → MODEL ROUTER → GENERATION QUEUE → PROVIDER ADAPTER → IMAGE/VIDEO MODEL → OUTPUT → EVALUATION → QUALITY CONTROL → ASSET/PROJECT STORAGE.

External providers should be accessed through adapters or isolated integrations whenever practical.

## 7. IMAGE GENERATION

Image generation is a separate production capability supporting text-to-image, reference-image generation, character consistency, environment consistency, style consistency, asset reuse, and future provider replacement. Preserve character identity, proportions, palette, clothing, facial structure, lighting, rendering style, and environment continuity. Nano Banana/Gemini-based generation may be used where configured, but the core application must not become permanently dependent on one provider.

## 8. VIDEO GENERATION

Video generation is separate from image generation. Support image-to-video, text-to-video, reference-driven generation, configurable duration, configurable parameters, and future model replacement. A failed provider must not corrupt project data, assets, style information, generation history, or queue state.

## 9. MODEL ROUTING

The model router selects provider/model based eventually on task type, capability, availability, cost, latency, quality, user preference, historical performance, and failure rate. Do not hardcode one provider as permanent. External routing systems such as OmniRoute may be integrated only as isolated infrastructure after compatibility and security verification.

## 10. OMNIROUTE / EXTERNAL MODEL GATEWAYS

If OmniRoute or another external model gateway is introduced, initially operate it as an isolated component. Preferred architecture: Mindscape Core → existing providers and/or external gateway adapter → gateway. Do not allow an experimental gateway to become a single point of failure. Existing providers must remain usable if the gateway fails.

## 11. GENERATION QUEUE

Generation requests are jobs. Lifecycle: QUEUED → VALIDATING → PREPARING_CONTEXT → GENERATING → EVALUATING → COMPLETED. Failure: GENERATING → FAILED → ERROR CLASSIFICATION → RETRY/FALLBACK/USER ACTION. A failed job must not corrupt other jobs. Eventually support retry, cancellation, priority, provider fallback, job status, error reporting, and generation history.

## 12. STYLE BIBLE

The Style Bible is a core consistency system containing visual style, rendering style, line quality, shading, lighting, color palette, proportions, character rules, environment rules, camera rules, animation rules, and continuity rules. Treat it as production context, not merely documentation. Supply relevant Style Bible information to generation systems where supported.

## 13. MASTER ASSET SYSTEM

Master Assets are authoritative production references: character sheets, turnaround sheets, facial references, expressions, poses, walk cycles, environment sheets, props, backgrounds, palettes, and visual references. Distinguish MASTER ASSET from GENERATED VARIATION. Generated outputs must not silently replace authoritative master assets.

## 14. CHARACTER CONSISTENCY

Existing characters must preserve established identity: age, proportions, body shape, skin tone, eyes, hair, facial structure, clothing, colors, accessories, and distinguishing features. Do not redesign an existing character unless explicitly instructed.

## 15. CURRENT ANIMATION PROJECT

Primary animation project: “The Shadow of Innocence — Rise of the Rebel”. Current direction: Instagram-first, short-form animation, reels capped around 30 seconds, AI-assisted production, vector-based character and environment assets, consistent anime-inspired visual language, reusable master assets, and strong scene continuity. Focus on production efficiency and consistency rather than returning to the previous long-form episode plan.

## 16. DASHBOARD

The dashboard is the central production interface. It should eventually provide project management, image generation, video generation, asset management, Style Bible, Master Assets, generation queue, generation history, model/provider configuration, evaluation, editing, project settings, and appropriate errors/logs. UI/UX should be modular and professional. Do not copy another company's interface directly.

## 17. IMAGE / VIDEO / EDITING SEPARATION

Maintain separate conceptual workspaces: IMAGE GENERATION, VIDEO GENERATION, EDITING/POST-PRODUCTION. They may share assets, Style Bible, project context, and generation history, but workflows should remain logically separated.

## 18. ERROR HANDLING

Errors must be classified rather than hidden. Useful categories: AUTHENTICATION_ERROR, CREDENTIAL_ERROR, PROVIDER_ERROR, RATE_LIMIT, QUOTA_EXCEEDED, NETWORK_ERROR, TIMEOUT, INVALID_INPUT, INVALID_MODEL, CONTENT_REJECTION, QUEUE_ERROR, STORAGE_ERROR, CONFIGURATION_ERROR, UNKNOWN_ERROR. When possible provide human-readable explanation, technical error, provider, request/job ID, retry possibility, fallback possibility, and recommended action. Never hide an error merely to make the UI appear successful.

## 19. FALLBACKS

If Provider A fails: classify error → retry if appropriate → fallback Provider B if configured → otherwise report failure. Fallbacks must not create uncontrolled costs.

## 20. LOGGING

Logs should diagnose problems without exposing secrets. Never log API keys, authorization headers, passwords, or private credentials. Prefer structured logging with timestamp, job ID, provider, model, task type, duration, status, and error category.

## 21. COST CONTROL

Before implementing any paid provider, verify pricing, free limits, credit system, rate limits, and failure billing behaviour. Do not silently introduce a paid API. Explicit authorization is required for paid services where relevant.

## 22. DEPENDENCY POLICY

Before adding a dependency: determine necessity; check whether existing dependencies suffice; consider maintenance/security; check Node/runtime compatibility; avoid unnecessary dependency growth. Do not replace existing dependencies without justification.

## 23. TESTING

Test at the smallest useful level first. For model changes: configuration test → provider connection test → minimal generation test → queue test → output validation → UI integration test. For UI changes: build/start test → affected component test → API integration test → browser workflow test. Do not claim “working” solely because the application starts.

## 24. DEPLOYMENT

Render is part of the deployment environment. Preferred flow: GitHub → main → Render → production. Experimental services should use separate environments/services whenever practical. Never change production environment variables or deployment configuration without explicit authorization.

## 25. GITHUB POLICY

Use feature branches for meaningful changes. Preferred patterns: feature/<name>, fix/<name>, experiment/<name>. Before merging: inspect diff, run tests, verify no secrets, verify no unrelated changes, and verify backwards compatibility.

## 26. ROLLBACK PRINCIPLE

Every significant architectural change should have a clear rollback path. Before changing a critical component, identify affected files, current behaviour, expected new behaviour, rollback method, and test procedure. Never remove a working implementation before its replacement is verified.

## 27. CURRENT PRIORITY

Immediate priorities: stabilize the existing agent; establish the dashboard; establish Style Bible; establish Master Assets; separate image/video generation; stabilize the generation queue; establish provider abstraction; establish evaluation and error handling; add new providers/gateways in isolated modules; expand the production environment incrementally.

## 28. WORK STYLE

The user wants execution rather than endless planning. For each task: DEFINE → IMPLEMENT → TEST → VERIFY → MARK COMPLETE. Avoid unnecessary discussion when a concrete implementation can safely be performed, but never sacrifice repository safety merely to move faster.

## 29. WHEN SOMETHING FAILS

Do not repeatedly apply random fixes. Capture the exact error; identify the layer; reproduce it; determine root cause; identify the smallest fix; implement; retest; document the solution if likely to recur.

## 30. FINAL RULE

Treat the existing Mindscape system as production infrastructure that must be preserved and incrementally improved. Do not rewrite without authorization, destroy working functionality, expose secrets, silently deploy, silently spend money, silently change providers, silently alter architecture, or claim success without verification. When uncertain: INSPECT FIRST → EXPLAIN → ASK → IMPLEMENT.
