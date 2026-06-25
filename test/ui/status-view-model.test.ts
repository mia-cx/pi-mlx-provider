import { describe, expect, it } from "vitest";
import { renderStatusText } from "../../src/ui/status-view-model";

describe("renderStatusText", () => {
  it("shows server state separately from download state and unresolved models", () => {
    expect(
      renderStatusText({
        server: {
          status: "running",
          modelId: "mlx-community/a",
          environment: "lm/default",
          prewarmed: true,
        },
        download: {
          downloadStatus: "downloading",
          modelId: "mlx-community/b",
          progress: "40%",
        },
        unresolvedModels: [
          {
            modelId: "mlx-community/weird",
            modelCardUrl: "https://huggingface.co/mlx-community/weird",
          },
        ],
      }),
    ).toContain("Prewarmed: yes");
  });
});
