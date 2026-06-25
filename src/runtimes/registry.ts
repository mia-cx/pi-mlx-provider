import type { RuntimeName } from "../commands/parse";

export type RuntimeDefinition = {
  environment: RuntimeName;
  packageName: string;
  moduleName: string;
  capabilities: {
    inputs: string[];
    outputs: string[];
  };
};

const runtimeDefinitions: Record<RuntimeName, RuntimeDefinition> = {
  lm: {
    environment: "lm",
    packageName: "mlx-lm",
    moduleName: "mlx_lm.server",
    capabilities: { inputs: ["text"], outputs: ["text"] },
  },
  vlm: {
    environment: "vlm",
    packageName: "mlx-vlm",
    moduleName: "mlx_vlm.server",
    capabilities: { inputs: ["text", "image"], outputs: ["text"] },
  },
  optiq: {
    environment: "optiq",
    packageName: "mlx-optiq",
    moduleName: "optiq",
    capabilities: { inputs: ["text", "image"], outputs: ["text"] },
  },
};

export function getRuntimeDefinition(
  environment: RuntimeName,
): RuntimeDefinition {
  return runtimeDefinitions[environment];
}
