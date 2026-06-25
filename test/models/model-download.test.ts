import { describe, expect, it } from "vitest";
import {
  createModelDownloadPlan,
  modelDownloadFailureMessage,
} from "../../src/models/model-download";

describe("model download", () => {
  it("downloads through Hugging Face tooling into the normal cache", () => {
    expect(createModelDownloadPlan("mlx-community/example")).toEqual({
      command: "python",
      args: [
        "-m",
        "huggingface_hub.commands.download",
        "mlx-community/example",
      ],
      cache: "huggingface",
    });
  });

  it("explains gated model failures", () => {
    expect(
      modelDownloadFailureMessage("mlx-community/private", "401 Unauthorized"),
    ).toContain("huggingface-cli login");
  });
});
