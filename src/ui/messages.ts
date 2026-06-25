export function unknownRuntimeMessage(modelId: string): string {
  return [
    `Could not automatically figure out what runtime is needed for ${modelId}.`,
    `Check the model card: https://huggingface.co/${modelId}`,
    `Configure it with: /mlx runtime set ${modelId} vlm@0.4.3`,
  ].join("\n");
}
