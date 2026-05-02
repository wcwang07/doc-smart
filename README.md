# Vercel UI

Minimal Next.js UI for the RAG backend.

## Environment variables

Create `.env.local` for local development or configure the same values in Vercel:

```bash
BACKEND_BASE_URL=http://100.20.142.45
BACKEND_API_KEY=replace-me
```

`BACKEND_BASE_URL` and `BACKEND_API_KEY` are used by the small Vercel API proxy routes for documents, job status, chat, upload presign, and upload completion.

The browser asks this Next app for a presigned upload URL at `/api/uploads/presign`, uploads the file bytes with `PUT` to that URL, then completes the upload with JSON at `/api/uploads/complete`. File bytes only go to the presigned storage URL, so uploads do not pass through Vercel's request body limit.

Because file bytes upload browser-to-storage, the presigned storage target must allow the browser `PUT` with the returned upload headers.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Routes

- `POST /api/uploads/presign`
- `POST /api/uploads/complete`
- `GET /api/jobs/:jobId`
- `POST /api/conversation-answer`

The UI uploads directly to presigned storage after calling `/api/uploads/presign`, then completes the upload with JSON at `/api/uploads/complete`. The JSON routes proxy to the backend and add the backend `X-API-Key` header server-side.
# doc-smart
