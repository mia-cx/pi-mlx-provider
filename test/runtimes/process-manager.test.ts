import { describe, expect, it } from "vitest";
import { ProcessManager } from "../../src/runtimes/process-manager";

describe("ProcessManager", () => {
  it("tracks and stops only extension-owned processes", async () => {
    const killed: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    const manager = new ProcessManager({
      kill: (pid, signal) => killed.push({ pid, signal }),
    });

    manager.track({
      pid: 123,
      modelId: "mlx-community/a",
      environment: "lm/default",
    });
    await manager.stopAll();

    expect(killed).toEqual([{ pid: 123, signal: "SIGTERM" }]);
    expect(manager.ownedProcesses()).toEqual([]);
  });
});
