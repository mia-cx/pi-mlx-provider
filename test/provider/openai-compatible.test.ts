import { describe, expect, it } from "vitest";
import { forwardOpenAiRequest } from "../../src/provider/openai-compatible";

describe("forwardOpenAiRequest", () => {
  it("forwards chat completions to the runtime base URL", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const response = await forwardOpenAiRequest({
      baseUrl: "http://127.0.0.1:8080/v1",
      path: "/chat/completions",
      body: { model: "mlx-community/Qwen2.5-7B-4bit", messages: [] },
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ id: "chatcmpl-local" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:8080/v1/chat/completions",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "mlx-community/Qwen2.5-7B-4bit",
            messages: [],
          }),
        },
      },
    ]);
    expect(await response.json()).toEqual({ id: "chatcmpl-local" });
  });
});
