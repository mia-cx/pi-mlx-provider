import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerMlxExtension } from "../../src/pi/register";

type ExecResult = { code: number; stdout: string; stderr: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("MLX progress widget", () => {
  it("shows an install progress bar in the sticky widget", async () => {
    let commandHandler:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    const execs: Array<ReturnType<typeof deferred<ExecResult>>> = [];
    const widgets: unknown[] = [];
    const statuses: unknown[] = [];
    const pi = {
      exec: () => {
        const pending = deferred<ExecResult>();
        execs.push(pending);
        return pending.promise;
      },
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

    const run = commandHandler?.("init lm", {
      ui: {
        notify: vi.fn(),
        setStatus: (_key: string, status: unknown) => statuses.push(status),
        setWidget: (_key: string, widget: unknown) => widgets.push(widget),
      },
    });

    await vi.waitFor(() => expect(execs).toHaveLength(1));
    expect(String(widgets.at(-1))).toContain("Activity: installing lm/default");
    expect(String(widgets.at(-1))).toContain("Progress: [");
    expect(statuses.at(-1)).toContain("installing lm/default");

    execs[0]?.resolve({ code: 0, stdout: "", stderr: "" });
    await vi.waitFor(() => expect(execs).toHaveLength(2));
    execs[1]?.resolve({ code: 0, stdout: "", stderr: "" });
    await run;
  });

  it("shows a model download progress bar in the sticky widget", async () => {
    let commandHandler:
      | ((args: string, ctx: unknown) => Promise<void>)
      | undefined;
    const exec = deferred<ExecResult>();
    const widgets: unknown[] = [];
    const pi = {
      exec: () => exec.promise,
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

    let customCalls = 0;
    const run = commandHandler?.("", {
      hasUI: true,
      ui: {
        confirm: vi.fn(async () => true),
        custom: vi.fn(async () => {
          customCalls++;
          if (customCalls === 1) return "start";
          return { kind: "download", modelId: "mlx-community/NewModel-4bit" };
        }),
        notify: vi.fn(),
        setStatus: vi.fn(),
        setWidget: (_key: string, widget: unknown) => widgets.push(widget),
      },
    });

    await vi.waitFor(() => {
      expect(String(widgets.at(-1))).toContain(
        "Activity: downloading mlx-community/NewModel-4bit",
      );
    });
    expect(String(widgets.at(-1))).toContain("Progress: [");

    exec.resolve({ code: 1, stdout: "", stderr: "download failed" });
    await run;
  });
});
