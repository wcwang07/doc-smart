export const runtime = "nodejs";

import { getBackendConfig, logBackendConfig } from "../_backend";

export async function GET() {
  try {
    const { baseUrl, apiKey } = getBackendConfig();
    logBackendConfig("api/documents", { baseUrl, apiKey });

    const response = await fetch(`${baseUrl}/documents`, {
      headers: {
        "X-API-Key": apiKey
      },
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
        detail: error instanceof Error ? error.message : "Documents proxy failed."
      },
      { status: 500 }
    );
  }
}
