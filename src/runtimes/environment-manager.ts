import { join } from "node:path";
import type { RuntimeName } from "../commands/parse";
import { getRuntimeDefinition } from "./registry";

export type EnvironmentInstallPlanInput = {
  extensionDir: string;
  environment: RuntimeName;
  version: string;
};

export type CommandPlan = {
  command: string;
  args: string[];
};

export type EnvironmentInstallPlan = {
  venvPath: string;
  commands: CommandPlan[];
};

export type CommandRunner = (command: CommandPlan) => Promise<void> | void;

export function createEnvironmentInstallPlan({
  extensionDir,
  environment,
  version,
}: EnvironmentInstallPlanInput): EnvironmentInstallPlan {
  const venvPath = join(
    extensionDir,
    "environments",
    environment,
    version,
    ".venv",
  );
  const packageSpec = packageSpecFor(environment, version);

  return {
    venvPath,
    commands: [
      { command: "uv", args: ["venv", venvPath] },
      {
        command: "uv",
        args: [
          "pip",
          "install",
          "--python",
          join(venvPath, "bin", "python"),
          packageSpec,
        ],
      },
    ],
  };
}

export async function installEnvironment(
  input: EnvironmentInstallPlanInput,
  run: CommandRunner,
): Promise<EnvironmentInstallPlan> {
  const plan = createEnvironmentInstallPlan(input);
  for (const command of plan.commands) {
    await run(command);
  }
  return plan;
}

function packageSpecFor(environment: RuntimeName, version: string): string {
  const packageName = getRuntimeDefinition(environment).packageName;
  return version === "default" ? packageName : `${packageName}==${version}`;
}
