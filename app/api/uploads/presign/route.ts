export const runtime = "nodejs";

import { getBackendConfig, logBackendConfig } from "../../_backend";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { baseUrl, apiKey } = getBackendConfig();
    logBackendConfig("api/uploads/presign", { baseUrl, apiKey });

    const response = await fetch(`${baseUrl}/uploads/presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json"
      }
    });
  } catch (error) {
    return Response.json(
      {
        detail: error instanceof Error ? error.message : "Upload presign proxy failed."
      },
      { status: 500 }
    );
  }
}
