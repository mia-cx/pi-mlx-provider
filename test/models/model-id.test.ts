import { describe, expect, it } from "vitest";
import { parseModelReference, toSafeModelId } from "../../src/models/model-id";

describe("parseModelReference", () => {
  it("separates Pi model ids from raw Hugging Face ids", () => {
    expect(parseModelReference("mlx/mlx-community/Qwen2.5-7B-4bit")).toEqual({
      piModelId: "mlx/mlx-community/Qwen2.5-7B-4bit",
      huggingFaceId: "mlx-community/Qwen2.5-7B-4bit",
    });
  });

  it("creates filesystem-safe model ids", () => {
    expect(toSafeModelId("mlx-community/Qwen2.5-7B-4bit")).toBe(
      "mlx-community--Qwen2.5-7B-4bit",
    );
  });
});
