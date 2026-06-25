import type { CommandPlan } from "../runtimes/environment-manager";

export type ModelDownloadPlan = CommandPlan & {
  cache: "huggingface";
};

export function createModelDownloadPlan(modelId: string): ModelDownloadPlan {
  return {
    command: "python",
    args: ["-m", "huggingface_hub.commands.download", modelId],
    cache: "huggingface",
  };
}

export function modelDownloadFailureMessage(
  modelId: string,
  error: string,
): string {
  return [
    `Could not download ${modelId}: ${error}`,
    `Model card: https://huggingface.co/${modelId}`,
    "If this model is private or gated, run `huggingface-cli login` and request model access.",
  ].join("\n");
}
