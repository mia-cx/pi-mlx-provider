import type { CommandPlan } from "./environment-manager";

export type ProbePlanInput = {
  pythonPath: string;
  modelId: string;
  environment: string;
};

export function createProbePlan({
  pythonPath,
  modelId,
  environment,
}: ProbePlanInput): CommandPlan {
  const code = [
    "import sys",
    `print('probing ${environment} for ${modelId}')`,
    "sys.exit(0)",
  ].join("; ");

  return { command: pythonPath, args: ["-c", code] };
}
