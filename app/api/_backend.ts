type BackendConfig = {
  apiKey: string;
  baseUrl: string;
};

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) {
    return "***";
  }

  return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
}

export function getBackendConfig(): BackendConfig {
  const baseUrl = process.env.BACKEND_BASE_URL;
  const apiKey = process.env.BACKEND_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("BACKEND_BASE_URL and BACKEND_API_KEY must be configured.");
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export function logBackendConfig(routeName: string, config: BackendConfig) {
  console.log(`[${routeName}] backend env loaded`, {
    apiKeyPresent: Boolean(config.apiKey),
    apiKeyPreview: maskApiKey(config.apiKey),
    baseUrl: config.baseUrl
  });
}
