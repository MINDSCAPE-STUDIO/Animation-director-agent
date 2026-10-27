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


## 6. Optional persistent storage with Cloudflare R2

The app supports an S3-compatible object store. Cloudflare R2 is the suggested low-cost option for generated media and metadata. Its published free monthly allowance includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations, with no internet egress charge; usage above those allowances can be billed. Review the official pricing and set usage alerts before production use: https://developers.cloudflare.com/r2/pricing/.

Create an R2 bucket and an R2 API token with read/write access to that bucket. Add the following environment variables in Render, on the server only (never in browser code):

- `OBJECT_STORAGE_ENDPOINT`: `https://<account-id>.r2.cloudflarestorage.com`
- `OBJECT_STORAGE_BUCKET`: bucket name
- `OBJECT_STORAGE_ACCESS_KEY_ID`: R2 S3 access-key ID
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`: matching secret access key
- `OBJECT_STORAGE_REGION`: `auto`
- `OBJECT_STORAGE_PREFIX`: `mindscape-studio`

At startup the service verifies signed read/write access and restores generation history and metadata from the bucket. New metadata and generated media are backed up to it, and generated URLs can be served from object storage after the local Render cache is empty. The dashboard's readiness response reports storage health. If the object-storage variables are absent, the agent continues using the local filesystem, which is ephemeral on Render Free.
