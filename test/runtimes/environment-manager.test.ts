import { describe, expect, it } from "vitest";
import {
  createEnvironmentInstallPlan,
  installEnvironment,
} from "../../src/runtimes/environment-manager";

describe("createEnvironmentInstallPlan", () => {
  it("installs into extension-owned environment paths with uv argument arrays", () => {
    expect(
      createEnvironmentInstallPlan({
        extensionDir: "/pi/mlx",
        environment: "vlm",
        version: "0.4.3",
      }),
    ).toEqual({
      venvPath: "/pi/mlx/environments/vlm/0.4.3/.venv",
      commands: [
        {
          command: "uv",
          args: ["venv", "/pi/mlx/environments/vlm/0.4.3/.venv"],
        },
        {
          command: "uv",
          args: [
            "pip",
            "install",
            "--python",
            "/pi/mlx/environments/vlm/0.4.3/.venv/bin/python",
            "mlx-vlm==0.4.3",
          ],
        },
      ],
    });
  });

  it("runs every planned install command through an injected runner", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];

    await installEnvironment(
      { extensionDir: "/pi/mlx", environment: "lm", version: "default" },
      async (command) => {
        calls.push(command);
      },
    );

    expect(calls.map((call) => call.command)).toEqual(["uv", "uv"]);
  });
});
