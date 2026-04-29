export const runtime = "nodejs";

function getBackendConfig() {
  const baseUrl = process.env.BACKEND_BASE_URL;
  const apiKey = process.env.BACKEND_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("BACKEND_BASE_URL and BACKEND_API_KEY must be configured.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const { baseUrl, apiKey } = getBackendConfig();

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
