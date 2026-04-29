export const runtime = "nodejs";

function getBackendConfig() {
  const baseUrl = process.env.BACKEND_BASE_URL;
  const apiKey = process.env.BACKEND_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("BACKEND_BASE_URL and BACKEND_API_KEY must be configured.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { baseUrl, apiKey } = getBackendConfig();

    const response = await fetch(`${baseUrl}/conversation-answer`, {
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
        detail: error instanceof Error ? error.message : "Conversation proxy failed."
      },
      { status: 500 }
    );
  }
}
