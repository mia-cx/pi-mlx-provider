import { describe, expect, it } from "vitest";
import { RuntimeServerManager } from "../../src/runtimes/server-manager";

describe("RuntimeServerManager", () => {
  it("marks /mlx start servers as prewarmed until /model switches", async () => {
    const manager = new RuntimeServerManager();
    await manager.prewarm({
      modelId: "mlx-community/a",
      environment: "lm/default",
      pid: 42,
    });

    expect(manager.status()).toMatchObject({
      status: "running",
      modelId: "mlx-community/a",
      prewarmed: true,
    });

    manager.selectModel("mlx-community/a");

    expect(manager.status()).toMatchObject({
      status: "running",
      modelId: "mlx-community/a",
      prewarmed: false,
    });
  });
});
