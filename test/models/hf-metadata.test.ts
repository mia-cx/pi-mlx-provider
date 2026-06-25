import { describe, expect, it } from "vitest";
import { fetchHfMetadata } from "../../src/models/hf-metadata";

describe("fetchHfMetadata", () => {
  it("fetches small Hugging Face metadata and README without weight files", async () => {
    const urls: string[] = [];
    const metadata = await fetchHfMetadata("mlx-community/example", {
      fetch: async (url) => {
        urls.push(String(url));
        if (String(url).endsWith("/api/models/mlx-community/example")) {
          return Response.json({
            sha: "abc",
            siblings: [{ rfilename: "config.json" }],
            tags: ["mlx"],
          });
        }
        return new Response("Use mlx-lm.");
      },
    });

    expect(metadata).toMatchObject({
      modelId: "mlx-community/example",
      resolvedRevision: "abc",
      readme: "Use mlx-lm.",
    });
    expect(urls).not.toContain(expect.stringMatching(/safetensors|gguf|bin/));
  });
});
