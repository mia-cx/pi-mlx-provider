export type RuntimeName = "lm" | "vlm" | "optiq";

export type RuntimeTarget = {
  kind: "environment";
  environment: RuntimeName;
  version: string;
};

export type ModelTarget = {
  kind: "model";
  modelId: string;
};

export type InitCommand = {
  type: "init";
  target: RuntimeTarget | ModelTarget | { kind: "all" };
  force: boolean;
};

export type MlxCommand =
  | { type: "status" }
  | InitCommand
  | { type: "start"; modelId?: string }
  | { type: "stop" }
  | { type: "logs" }
  | { type: "reprobe"; modelId: string }
  | { type: "context"; value?: string }
  | { type: "tokens"; value?: string }
  | {
      type: "runtime-set";
      modelId: string;
      environment: RuntimeTarget | { kind: "auto" };
    }
  | {
      type: "max";
      key: "memory" | "models" | "context" | "tokens";
      value: string;
    };

const runtimeNames = new Set<RuntimeName>(["lm", "vlm", "optiq"]);

export function parseMlxCommand(input: string): MlxCommand {
  const tokens = input.trim().split(/\s+/);

  if (tokens.length === 1 && tokens[0] === "/mlx") return { type: "status" };
  if (tokens[0] !== "/mlx")
    throw new Error(`Unsupported /mlx command: ${input}`);

  switch (tokens[1]) {
    case "status":
      return { type: "status" };
    case "init":
      if (!tokens[2]) throw new Error("/mlx init requires a target");
      return {
        type: "init",
        target:
          tokens[2] === "--all"
            ? { kind: "all" }
            : parseRuntimeTarget(tokens[2]),
        force: tokens.includes("--force"),
      };
    case "start":
      return tokens[2]
        ? { type: "start", modelId: tokens[2] }
        : { type: "start" };
    case "stop":
      return { type: "stop" };
    case "logs":
      return { type: "logs" };
    case "reprobe":
      if (!tokens[2]) throw new Error("/mlx reprobe requires a model id");
      return { type: "reprobe", modelId: tokens[2] };
    case "context":
      return tokens[2]
        ? { type: "context", value: tokens[2] }
        : { type: "context" };
    case "tokens":
    case "max-tokens":
      return tokens[2]
        ? { type: "tokens", value: tokens[2] }
        : { type: "tokens" };
    case "runtime":
      if (tokens[2] !== "set" || !tokens[3] || !tokens[4]) {
        throw new Error(
          "Usage: /mlx runtime set <model-id> <environment|auto>",
        );
      }
      return {
        type: "runtime-set",
        modelId: tokens[3],
        environment:
          tokens[4] === "auto"
            ? { kind: "auto" }
            : parseEnvironmentTarget(tokens[4]),
      };
    case "max":
      if (
        (tokens[2] !== "memory" &&
          tokens[2] !== "models" &&
          tokens[2] !== "context" &&
          tokens[2] !== "tokens" &&
          tokens[2] !== "output" &&
          tokens[2] !== "max-tokens") ||
        !tokens[3]
      ) {
        throw new Error(
          "Usage: /mlx max memory <amount>, /mlx max models <count>, /mlx max context <tokens|auto>, or /mlx max tokens <tokens|auto>",
        );
      }
      return {
        type: "max",
        key:
          tokens[2] === "output" || tokens[2] === "max-tokens"
            ? "tokens"
            : tokens[2],
        value: tokens[3],
      };
    default:
      throw new Error(`Unsupported /mlx command: ${input}`);
  }
}

function parseRuntimeTarget(input: string): RuntimeTarget | ModelTarget {
  const [environment] = input.replace("@", "/").split("/");

  if (!runtimeNames.has(environment as RuntimeName)) {
    return { kind: "model", modelId: input };
  }

  return parseEnvironmentTarget(input);
}

function parseEnvironmentTarget(input: string): RuntimeTarget {
  const [environment, version = "default"] = input.replace("@", "/").split("/");

  if (!runtimeNames.has(environment as RuntimeName)) {
    throw new Error(`Unknown runtime environment: ${environment}`);
  }

  return {
    kind: "environment",
    environment: environment as RuntimeName,
    version,
  };
}
