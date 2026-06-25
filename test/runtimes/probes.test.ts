import { describe, expect, it } from "vitest";
import { createProbePlan } from "../../src/runtimes/probes";

describe("createProbePlan", () => {
  it("uses installed environment python instead of uvx", () => {
    expect(
      createProbePlan({
        pythonPath: "/env/.venv/bin/python",
        modelId: "mlx-community/a",
        environment: "lm/default",
      }),
    ).toEqual({
      command: "/env/.venv/bin/python",
      args: ["-c", expect.stringContaining("mlx-community/a")],
    });
  });
});
