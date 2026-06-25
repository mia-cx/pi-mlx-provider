import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMlxExtension } from "../../src/pi/register";
import { spawnWithArgs } from "../../src/utils/spawn";

vi.mock("../../src/utils/spawn", () => ({
  spawnWithArgs: vi.fn(() => ({
    pid: 1234,
    stdout: { pipe: vi.fn() },
    stderr: { pipe: vi.fn() },
  })),
}));

describe("/mlx start", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("starts the selected MLX model when no model id is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );

    let commandHandler:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    const extensionDir = await mkdtemp(join(tmpdir(), "mlx-provider-"));
    const pythonPath = join(
      extensionDir,
      "environments",
      "lm",
      "default",
      ".venv",
      "bin",
      "python",
    );
    await mkdir(join(pythonPath, ".."), { recursive: true });
    await writeFile(pythonPath, "");

    const pi = {
      registerProvider: () => {},
      registerCommand: (
        _name: string,
        options: { handler: (args: string, ctx: unknown) => Promise<void> },
      ) => {
        commandHandler = options.handler;
      },
      on: () => {},
    };

    await registerMlxExtension(pi as unknown as ExtensionAPI, {
      extensionDir,
      scanCachedModels: async () => [],
    });

    await commandHandler?.("start", {
      model: { provider: "mlx", id: "mlx-community/Qwen3-0.6B-4bit" },
      ui: {
        notify: vi.fn(),
        setStatus: vi.fn(),
        setWidget: vi.fn(),
      },
    });

    expect(spawnWithArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          "--model",
          "mlx-community/Qwen3-0.6B-4bit",
        ]),
      }),
    );
  });
});
