# Implementation Plan: Cloudflare R2 Captures Storage for Visual Inspection

## Context & Motivation
Currently, captures are stored as JSON blobs containing base64 image strings in Cloudflare Workers KV (`POMONA_QUOTA_KV`). While functional, KV does not offer native image rendering in the Cloudflare Dashboard or direct image streaming.

Cloudflare R2 Object Storage solves this:
- Images are stored as raw binaries (`image/jpeg` / `image/webp`) with proper `Content-Type`.
- The Cloudflare Dashboard has a built-in Object browser with image preview.
- Companion `.json` audit records and `customMetadata` capture metadata without hiding the image behind base64 encoding.
- R2 lifecycle rules automate 30-day eviction.

> **Note on Cloudflare Account Status**:
> Querying the account via Wrangler returned: `Please enable R2 through the Cloudflare Dashboard. [code: 10042]`.
> The code will support R2 natively (`POMONA_CAPTURES_BUCKET`) while maintaining graceful fallback to KV (`POMONA_QUOTA_KV`) if R2 is not yet enabled on the account.

---

## Proposed Architecture

1. **Storage Layout in R2 Bucket (`pomona-captures`)**:
   - `scans/${requestId}.jpg`: Raw JPEG image bytes with `httpMetadata: { contentType: mimeType }` and `customMetadata: { requestId, sessionId, outcome, produce, storedAt }`.
   - `scans/${requestId}.json`: Full audit JSON record (request details, focus polygon, candidates, full grading outcome).
   - `deep-scans/${requestId}.jpg`: Raw composite image bytes.
   - `deep-scans/${requestId}.json`: Full deep-scan audit JSON record.

2. **Direct Image Visualization Endpoints**:
   - `GET /api/v1/scan/storage/:id/image`: Serves the binary image with `Content-Type: image/jpeg` so clicking it opens the photo in the browser.
   - `GET /api/v1/deep-scan/storage/:id/image`: Serves the binary composite image.
   - `GET /api/v1/scan/storage/:id`: Returns JSON audit payload with direct `imageUrl` link.
   - `GET /api/v1/deep-scan/storage/:id`: Returns deep-scan audit payload with direct `imageUrl` link.

3. **Bindings & Configuration**:
   - `apps/proxy/src/types.ts`: Define `R2BucketLike` and add `POMONA_CAPTURES_BUCKET?: R2BucketLike` to `Env`.
   - `apps/proxy/wrangler.jsonc`: Add `r2_buckets` binding definition:
     ```jsonc
     "r2_buckets": [
       {
         "binding": "POMONA_CAPTURES_BUCKET",
         "bucket_name": "pomona-captures",
         "preview_bucket_name": "pomona-captures-preview"
       }
     ]
     ```

4. **Testing & Evals**:
   - Unit tests in `apps/proxy/test/scan.storage.test.ts` and `apps/proxy/test/deep-scan.storage.test.ts` verifying R2 storage, metadata headers, and binary image retrieval.
   - Evals in `packages/evals/test/capture-storage.test.ts` verifying acceptance with R2 bucket binding.

---

## Tasks

### Task 1: Add R2 Types and Helper in Proxy
- Add `R2BucketLike` and `POMONA_CAPTURES_BUCKET?: R2BucketLike` in `apps/proxy/src/types.ts`.
- Add helper to decode base64 to binary buffer (`Uint8Array`).

### Task 2: Implement R2 Storage with KV Fallback in `apps/proxy/src/index.ts`
- Update `storeScanCapture` and `storeDeepScanCapture`:
  - If `env.POMONA_CAPTURES_BUCKET` is present, write `${key}.jpg` and `${key}.json` to R2.
  - If only `env.POMONA_QUOTA_KV` is present, write to KV.
- Update `GET /api/v1/scan/storage/:id` and `GET /api/v1/deep-scan/storage/:id` to check R2 first, then KV.
- Add `GET /api/v1/scan/storage/:id/image` and `GET /api/v1/deep-scan/storage/:id/image` to stream binary image directly.

### Task 3: Update `wrangler.jsonc`
- Add `r2_buckets` binding for `POMONA_CAPTURES_BUCKET`.

### Task 4: Unit Tests & Evals
- Add tests in `apps/proxy/test/scan.storage.test.ts` for R2 write and image retrieval.
- Add tests in `apps/proxy/test/deep-scan.storage.test.ts` for R2 write and image retrieval.
- Update `packages/evals/test/capture-storage.test.ts` for R2 acceptance and KV fallback.
- Run deterministic evals and full typecheck.
