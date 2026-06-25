import { describe, expect, it } from "vitest";
import { resolveManifestFromMetadata } from "../../src/models/manifest-resolver";

describe("resolveManifestFromMetadata", () => {
  it("prefers optiq for OptiQ models and keeps lm as text fallback", () => {
    expect(
      resolveManifestFromMetadata({
        modelId: "mlx-community/gemma-4-e2b-it-qat-OptiQ-4bit",
        resolvedRevision: "abc123",
        readme: "Use mlx-optiq for image+text and mlx-lm for text.",
        files: ["optiq_config.json"],
      }),
    ).toMatchObject({
      preferredEnvironment: "optiq/default",
      requirements: {
        "text-to-text": "lm/default",
        "image-text-to-text": "optiq/default",
      },
      probeCandidates: ["optiq/default", "lm/default"],
    });
  });

  it("extracts mlx-vlm version hints from model cards", () => {
    expect(
      resolveManifestFromMetadata({
        modelId: "mlx-community/gemma-4-e2b-it-4bit",
        resolvedRevision: "abc123",
        readme: "Install mlx-vlm==0.4.3 for this checkpoint.",
        files: [],
      }).preferredEnvironment,
    ).toBe("vlm/0.4.3");
  });
});
