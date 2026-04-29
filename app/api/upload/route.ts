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
    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return Response.json({ detail: "A file upload is required." }, { status: 400 });
    }

    const payload = new FormData();
    payload.append("file", file, file.name);

    const { baseUrl, apiKey } = getBackendConfig();
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
