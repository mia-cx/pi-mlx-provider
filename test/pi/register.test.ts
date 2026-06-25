import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { registerMlxExtension } from "../../src/pi/register";

describe("registerMlxExtension", () => {
  it("registers real Pi provider, command, and lifecycle hooks", async () => {
    const calls: string[] = [];
    const pi = {
      registerProvider: (name: string, config: unknown) => {
        calls.push(`provider:${name}`);
        expect(config).toMatchObject({
          api: "openai-completions",
          models: [
            {
              contextWindow: 128_000,
              maxTokens: 128_000,
              reasoning: true,
            },
          ],
        });
      },
      registerCommand: (
        name: string,
        options: { handler: (...args: never[]) => unknown },
      ) => {
        calls.push(`command:${name}`);
        expect(options.handler).toBeTypeOf("function");
      },
      on: (event: string, handler: (...args: never[]) => unknown) => {
        calls.push(`event:${event}`);
        expect(handler).toBeTypeOf("function");
      },
    };

    await registerMlxExtension(pi as unknown as ExtensionAPI, {
      extensionDir: await mkdtemp(join(tmpdir(), "mlx-provider-")),
      scanCachedModels: async () => [
        {
          modelId: "mlx-community/Qwen3-0.6B-4bit",
          revision: "abc",
          cachePath: "/hf/model",
        },
      ],
    });

    expect(calls).toContain("provider:mlx");
    expect(calls).toContain("command:mlx");
    expect(calls).toContain("event:model_select");
    expect(calls).toContain("event:session_shutdown");
  });

  it("uses configured max output tokens in registered models", async () => {
    const extensionDir = await mkdtemp(join(tmpdir(), "mlx-provider-"));
    await writeFile(
      join(extensionDir, "config.json"),
      JSON.stringify({ maxTokens: 16_000 }),
    );

    let maxTokens: number | undefined;
    const pi = {
      registerProvider: (
        _name: string,
        config: { models: Array<{ maxTokens: number }> },
      ) => {
        maxTokens = config.models[0]?.maxTokens;
      },
      registerCommand: () => {},
      on: () => {},
    };

    await registerMlxExtension(pi as unknown as ExtensionAPI, {
      extensionDir,
      scanCachedModels: async () => [
        {
          modelId: "mlx-community/Qwen3-0.6B-4bit",
          revision: "abc",
          cachePath: "/hf/model",
        },
      ],
    });

    expect(maxTokens).toBe(16_000);
  });

  it("opens /mlx as a floating custom overlay", async () => {
    let commandHandler:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    let usedCustomOverlay = false;
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
      extensionDir: await mkdtemp(join(tmpdir(), "mlx-provider-")),
      scanCachedModels: async () => [],
    });

    await commandHandler?.("", {
      hasUI: true,
      ui: {
        custom: async (factory: (...args: unknown[]) => unknown) => {
          usedCustomOverlay = true;
          let selected: string | undefined;
          const component = factory(
            undefined,
            { fg: (_color: string, text: string) => text },
            undefined,
            (result: string | undefined) => {
              selected = result;
            },
          ) as { handleInput(data: string): void };

          component.handleInput("\u001bOB");
          component.handleInput("\r");
          return selected;
        },
        notify: () => {},
      },
    });

    expect(usedCustomOverlay).toBe(true);
  });

  it("keeps important model-id suffixes visible in the start dialog", async () => {
    let commandHandler:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    let customCalls = 0;
    let renderedStartDialog = "";
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
      extensionDir: await mkdtemp(join(tmpdir(), "mlx-provider-")),
      scanCachedModels: async () => [
        {
          modelId: "mlx-community/gemma-4-e2b-it-qat-optiq-4bit",
          revision: "abc",
          cachePath: "/hf/model",
        },
      ],
    });

    await commandHandler?.("", {
      hasUI: true,
      ui: {
        custom: async (factory: (...args: unknown[]) => unknown) => {
          customCalls++;
          if (customCalls === 1) return "start";

          const component = factory(
            undefined,
            { fg: (_color: string, text: string) => text },
            undefined,
            () => {},
          ) as { render(width: number): string[] };
          renderedStartDialog = component.render(72).join("\n");
          return undefined;
        },
        notify: () => {},
      },
    });

    expect(renderedStartDialog).toContain("qat-optiq");
  });

  it("uses Pi TUI select keybindings in the prewarm search", async () => {
    let commandHandler:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    let customCalls = 0;
    let renderedStartDialog = "";
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
      extensionDir: await mkdtemp(join(tmpdir(), "mlx-provider-")),
      scanCachedModels: async () => [
        {
          modelId: "mlx-community/first-model-4bit",
          revision: "abc",
          cachePath: "/hf/first",
        },
        {
          modelId: "mlx-community/second-model-4bit",
          revision: "abc",
          cachePath: "/hf/second",
        },
      ],
    });

    await commandHandler?.("", {
      hasUI: true,
      ui: {
        custom: async (factory: (...args: unknown[]) => unknown) => {
          customCalls++;
          if (customCalls === 1) return "start";

          const component = factory(
            undefined,
            { fg: (_color: string, text: string) => text },
            undefined,
            () => {},
          ) as {
            handleInput(data: string): void;
            render(width: number): string[];
          };
          component.handleInput("\u001bOB");
          renderedStartDialog = component.render(100).join("\n");
          return undefined;
        },
        notify: () => {},
      },
    });

    expect(renderedStartDialog).toContain("› mlx-community/second-model-4bit");
  });

  it("offers to download typed Hugging Face ids with no cached match", async () => {
    let commandHandler:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    let customCalls = 0;
    let renderedStartDialog = "";
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
      extensionDir: await mkdtemp(join(tmpdir(), "mlx-provider-")),
      scanCachedModels: async () => [
        {
          modelId: "mlx-community/Qwen3-0.6B-4bit",
          revision: "abc",
          cachePath: "/hf/model",
        },
      ],
    });

    await commandHandler?.("", {
      hasUI: true,
      ui: {
        custom: async (factory: (...args: unknown[]) => unknown) => {
          customCalls++;
          if (customCalls === 1) return "start";

          const component = factory(
            undefined,
            { fg: (_color: string, text: string) => text },
            undefined,
            () => {},
          ) as {
            handleInput(data: string): void;
            render(width: number): string[];
          };
          for (const char of "mlx-community/NewModel-4bit") {
            component.handleInput(char);
          }
          renderedStartDialog = component.render(84).join("\n");
          return undefined;
        },
        notify: () => {},
      },
    });

    expect(renderedStartDialog).toContain(
      "Download 'mlx-community/NewModel-4bit' from Hugging Face",
    );
  });

  it("hides the sticky widget when no MLX model is selected or prewarmed", async () => {
    const handlers = new Map<string, (...args: never[]) => unknown>();
    const widgets: unknown[] = [];
    const statuses: unknown[] = [];
    const pi = {
      registerProvider: () => {},
      registerCommand: () => {},
      on: (event: string, handler: (...args: never[]) => unknown) => {
        handlers.set(event, handler);
      },
    };

    await registerMlxExtension(pi as unknown as ExtensionAPI, {
      extensionDir: await mkdtemp(join(tmpdir(), "mlx-provider-")),
      scanCachedModels: async () => [],
    });

    const ctx = {
      model: { provider: "anthropic", id: "claude" },
      ui: {
        setWidget: (_key: string, content: unknown) => widgets.push(content),
        setStatus: (_key: string, status: unknown) => statuses.push(status),
      },
    };

    await handlers.get("session_start")?.({} as never, ctx as never);
    await handlers.get("model_select")?.(
      { model: { provider: "anthropic", id: "claude" } } as never,
      ctx as never,
    );

    expect(widgets).toEqual([undefined, undefined]);
    expect(statuses).toEqual([undefined, undefined]);
  });
});
