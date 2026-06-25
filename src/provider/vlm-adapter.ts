import type { ServerCommand } from "./lm-adapter";

export type VlmServerCommandInput = {
  pythonPath: string;
  modelId: string;
  host: string;
  port: number;
};

export function buildVlmServerCommand({
  pythonPath,
  modelId,
  host,
  port,
}: VlmServerCommandInput): ServerCommand {
  return {
    command: pythonPath,
    args: [
      "-m",
      "mlx_vlm.server",
      "--model",
      modelId,
      "--host",
      host,
      "--port",
      String(port),
    ],
  };
}
