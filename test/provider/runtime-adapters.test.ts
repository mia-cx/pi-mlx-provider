import { describe, expect, it } from "vitest";
import { buildOptiqServerCommand } from "../../src/provider/optiq-adapter";
import { classifyRequestShape } from "../../src/provider/request-shape";
import { buildVlmServerCommand } from "../../src/provider/vlm-adapter";

describe("runtime adapters", () => {
  it("keeps OptiQ on optiq serve", () => {
    expect(
      buildOptiqServerCommand({
        executable: "optiq",
        modelId: "mlx-community/a",
        host: "127.0.0.1",
        port: 8080,
      }).args,
    ).toEqual([
      "serve",
      "--model",
      "mlx-community/a",
      "--host",
      "127.0.0.1",
      "--port",
      "8080",
    ]);
  });

  it("starts mlx-vlm through its module", () => {
    expect(
      buildVlmServerCommand({
        pythonPath: "/venv/bin/python",
        modelId: "mlx-community/a",
        host: "127.0.0.1",
        port: 8080,
      }).args[1],
    ).toBe("mlx_vlm.server");
  });

  it("classifies image attachments as image-text-to-text", () => {
    expect(
      classifyRequestShape({
        text: "describe",
        attachments: [{ kind: "image", path: "/a.png", displayName: "a.png" }],
      }),
    ).toBe("image-text-to-text");
  });
});
