# Vercel UI

Minimal Next.js UI for the RAG backend.

## Environment variables

Create `.env.local` for local development or configure the same values in Vercel:

```bash
BACKEND_BASE_URL=http://100.20.142.45
BACKEND_API_KEY=replace-me
```

`BACKEND_BASE_URL` and `BACKEND_API_KEY` are used by the small Vercel API proxy routes for documents, job status, chat, and upload config.

The browser reads upload config from `/api/upload-config`, requests an upload URL from `${BACKEND_BASE_URL}/uploads/presign`, uploads the file bytes with `PUT` to that URL, then posts JSON to `${BACKEND_BASE_URL}/uploads/complete`. File bytes only go to the presigned storage URL, so uploads do not pass through Vercel's request body limit. The upload API key is still exposed to the browser by that config route for this MVP, so replace it with short-lived upload tokens or another direct-upload auth flow before treating it as production-secret material.

Because uploads are browser-to-backend/storage, the backend must be reachable from the browser and must allow CORS for the frontend origin, `POST`, `Content-Type`, and the `X-API-Key` header. The presigned storage target must allow the browser `PUT` with the returned upload headers.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Routes

- `POST /api/upload`
- `GET /api/upload-config`
- `GET /api/jobs/:jobId`
- `POST /api/conversation-answer`

The UI uploads directly to presigned storage after reading `/api/upload-config` and `${BACKEND_BASE_URL}/uploads/presign`, then completes the upload with JSON at `${BACKEND_BASE_URL}/uploads/complete`. The remaining routes proxy to the backend and add the backend `X-API-Key` header server-side.
# doc-smart
