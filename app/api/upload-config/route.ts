export const runtime = "nodejs";

import { getBackendConfig } from "../_backend";

export async function GET() {
  try {
    const { baseUrl, apiKey } = getBackendConfig();

    return Response.json(
      { baseUrl, apiKey },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        detail: error instanceof Error ? error.message : "Upload config failed."
      },
      { status: 500 }
    );
  }
}
