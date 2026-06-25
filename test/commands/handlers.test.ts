import { describe, expect, it } from "vitest";
import { handleMlxCommand } from "../../src/commands/handlers";

describe("handleMlxCommand", () => {
  it("renders status for /mlx", async () => {
    const result = await handleMlxCommand(
      { type: "status" },
      {
        getStatus: async () => ({
          serverStatus: "stopped",
          downloadStatus: "idle",
        }),
      },
    );

    expect(result).toContain("Server: stopped");
    expect(result).toContain("Download: idle");
  });

  it("tells users to init before reprobe when model weights are uncached", async () => {
    const result = await handleMlxCommand(
      { type: "reprobe", modelId: "mlx-community/example" },
      { isModelCached: async () => false },
    );

    expect(result).toBe("run /mlx init mlx-community/example first");
  });
});
