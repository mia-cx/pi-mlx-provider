import { describe, expect, it } from "vitest";
import { getRuntimeDefinition } from "../../src/runtimes/registry";

describe("getRuntimeDefinition", () => {
  it("defines mlx-lm as the text runtime server", () => {
    expect(getRuntimeDefinition("lm")).toEqual({
      environment: "lm",
      packageName: "mlx-lm",
      moduleName: "mlx_lm.server",
      capabilities: { inputs: ["text"], outputs: ["text"] },
    });
  });
});
