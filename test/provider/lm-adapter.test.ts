import { describe, expect, it } from "vitest";
import { buildLmServerCommand } from "../../src/provider/lm-adapter";

describe("buildLmServerCommand", () => {
  it("starts mlx-lm through the environment python module", () => {
    expect(
      buildLmServerCommand({
        pythonPath: "/envs/lm/default/.venv/bin/python",
        modelId: "mlx-community/Qwen2.5-7B-4bit",
        host: "127.0.0.1",
        port: 8080,
      }),
    ).toEqual({
      command: "/envs/lm/default/.venv/bin/python",
      args: [
        "-m",
        "mlx_lm.server",
        "--model",
        "mlx-community/Qwen2.5-7B-4bit",
        "--host",
        "127.0.0.1",
        "--port",
        "8080",
      ],
    });
  });
});
