export type ForwardOpenAiRequestInput = {
  baseUrl: string;
  path: string;
  body: unknown;
  fetch?: typeof fetch;
};

export async function forwardOpenAiRequest({
  baseUrl,
  path,
  body,
  fetch: fetchImpl = fetch,
}: ForwardOpenAiRequestInput): Promise<Response> {
  const url = new URL(path.replace(/^\//, ""), withTrailingSlash(baseUrl));

  return fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
