# Run the real generation agent

This repository now has a browser director UI plus a Node cloud-generation service. Heavy AI generation runs remotely through model providers; the phone/desktop browser is only the control surface.

## 1. Configure secrets
Copy `.env.example` to `.env` on the server. Add `REPLICATE_API_TOKEN` and/or `FAL_KEY`. Never commit `.env` to GitHub.

## 2. Start the service
Use Node 20+:

```bash
npm start
```

Health check: `GET /health`
Create job: `POST /jobs`
List jobs: `GET /jobs`
Read job: `GET /jobs/:id`
Retry: `POST /jobs/:id/retry`

## 3. Architecture

Director prompt → Shot Contract → specialist contracts → model router → async generation job → result → evaluator → retry.

Replicate supports asynchronous predictions and webhooks for completed jobs. The service is designed around that model rather than blocking a browser request. See https://replicate.com/docs/topics/predictions/create-a-prediction and https://replicate.com/docs/topics/webhooks.

## 4. Important limitation
"Without limits" cannot literally mean unlimited compute or provider usage. Generation is constrained by provider availability, model capabilities, API quotas and cost. The agent itself is designed to be provider-agnostic so additional providers/models can be added rather than locking the studio to one service.

## 5. Production hardening still needed
For public deployment, add persistent storage, authenticated users, signed webhook verification, object storage for outputs, rate limiting, job cancellation, provider-specific input schemas, and a visual evaluator model.
