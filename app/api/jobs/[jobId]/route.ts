export const runtime = "nodejs";

import { getBackendConfig } from "../../_backend";
import { logBackendConfig } from "../../_backend";

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const { baseUrl, apiKey } = getBackendConfig();
    logBackendConfig("api/jobs/[jobId]", { baseUrl, apiKey });

    const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
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
        detail: error instanceof Error ? error.message : "Job proxy failed."
      },
      { status: 500 }
    );
  }
}
