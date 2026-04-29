# Vercel UI

Minimal Next.js UI for the RAG backend.

## Environment variables

Create `.env.local` for local development or configure the same values in Vercel:

```bash
BACKEND_BASE_URL=http://100.20.142.45
BACKEND_API_KEY=replace-me
```

`BACKEND_API_KEY` stays server-side in Vercel API routes and is never sent to the browser.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Routes

- `POST /api/upload`
- `GET /api/jobs/:jobId`
- `POST /api/conversation-answer`

Each route proxies to the backend and adds the backend `X-API-Key` header server-side.
# doc-smart
