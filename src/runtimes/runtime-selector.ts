import type { RuntimeName } from "../commands/parse";

export type RuntimeEnvironment = {
  environment: RuntimeName;
  version: string;
};

export type InvalidEnvironmentOverride = {
  environment: string;
  reason: string;
};

export type SelectPreferredEnvironmentInput = {
  modelId: string;
  manifestPreferredEnvironment: string;
  overrides?: Record<string, string>;
  invalidOverrides?: Record<string, InvalidEnvironmentOverride>;
};

export function selectPreferredEnvironment({
  modelId,
  manifestPreferredEnvironment,
  overrides = {},
  invalidOverrides = {},
}: SelectPreferredEnvironmentInput): RuntimeEnvironment {
  const override = overrides[modelId];
  const invalidOverride = invalidOverrides[modelId];

  if (override && invalidOverride?.environment === override) {
    throw new Error(
      `${modelId} is configured but currently failing: ${invalidOverride.reason}`,
    );
  }

  return parseRuntimeEnvironment(override ?? manifestPreferredEnvironment);
}

export function parseRuntimeEnvironment(input: string): RuntimeEnvironment {
  const [environment, version = "default"] = input.replace("@", "/").split("/");

  if (
    environment !== "lm" &&
    environment !== "vlm" &&
    environment !== "optiq"
  ) {
    throw new Error(`Unknown runtime environment: ${environment}`);
  }

  return { environment, version };
}
