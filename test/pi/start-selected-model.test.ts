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

async function createInstalledLmEnvironment(): Promise<string> {
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
  return extensionDir;
}

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
    const extensionDir = await createInstalledLmEnvironment();

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

  it("forces configured max tokens onto MLX provider requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );

    const handlers = new Map<string, (...args: never[]) => unknown>();
    const extensionDir = await createInstalledLmEnvironment();
    await writeFile(
      join(extensionDir, "config.json"),
      JSON.stringify({ maxTokens: 64_000 }),
    );
    const pi = {
      registerProvider: () => {},
      registerCommand: () => {},
      on: (event: string, handler: (...args: never[]) => unknown) => {
        handlers.set(event, handler);
      },
    };

    await registerMlxExtension(pi as unknown as ExtensionAPI, {
      extensionDir,
      scanCachedModels: async () => [],
    });

    const payload = await handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "mlx-community/Qwen3-0.6B-4bit",
          messages: [],
          max_completion_tokens: 4_096,
        },
      } as never,
      {
        model: { provider: "mlx", id: "mlx-community/Qwen3-0.6B-4bit" },
        ui: {
          setStatus: vi.fn(),
          setWidget: vi.fn(),
        },
      } as never,
    );

    expect(payload).toMatchObject({ max_tokens: 64_000 });
    expect(payload).not.toHaveProperty("max_completion_tokens");
  });

  it("starts the selected MLX model on session start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );

    const handlers = new Map<string, (...args: never[]) => unknown>();
    const extensionDir = await createInstalledLmEnvironment();
    const pi = {
      registerProvider: () => {},
      registerCommand: () => {},
      on: (event: string, handler: (...args: never[]) => unknown) => {
        handlers.set(event, handler);
      },
    };

    await registerMlxExtension(pi as unknown as ExtensionAPI, {
      extensionDir,
      scanCachedModels: async () => [],
    });

    await handlers.get("session_start")?.(
      {} as never,
      {
        model: { provider: "mlx", id: "mlx-community/Qwen3-0.6B-4bit" },
        ui: {
          setStatus: vi.fn(),
          setWidget: vi.fn(),
        },
      } as never,
    );

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
