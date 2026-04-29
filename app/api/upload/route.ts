export const runtime = "nodejs";

import { getBackendConfig } from "../_backend";
import { logBackendConfig } from "../_backend";

export async function POST(request: Request) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return Response.json({ detail: "A file upload is required." }, { status: 400 });
    }

    const payload = new FormData();
    payload.append("file", file, file.name);

    const { baseUrl, apiKey } = getBackendConfig();
    logBackendConfig("api/upload", { baseUrl, apiKey });
    const response = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey
      },
      body: payload
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
        detail: error instanceof Error ? error.message : "Upload proxy failed."
      },
      { status: 500 }
    );
  }
}
