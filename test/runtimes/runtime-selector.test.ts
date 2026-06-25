import { describe, expect, it } from "vitest";
import { selectPreferredEnvironment } from "../../src/runtimes/runtime-selector";

describe("selectPreferredEnvironment", () => {
  it("uses a per-model override before the manifest preference", () => {
    expect(
      selectPreferredEnvironment({
        modelId: "mlx-community/gemma-4-e2b-it-4bit",
        manifestPreferredEnvironment: "vlm/0.4.3",
        overrides: {
          "mlx-community/gemma-4-e2b-it-4bit": "lm/default",
        },
      }),
    ).toEqual({ environment: "lm", version: "default" });
  });

  it("does not silently select an override marked invalid", () => {
    expect(() =>
      selectPreferredEnvironment({
        modelId: "mlx-community/example-model",
        manifestPreferredEnvironment: "vlm/0.4.3",
        overrides: {
          "mlx-community/example-model": "optiq/default",
        },
        invalidOverrides: {
          "mlx-community/example-model": {
            environment: "optiq/default",
            reason: "probe failed",
          },
        },
      }),
    ).toThrow("configured but currently failing");
  });
});
