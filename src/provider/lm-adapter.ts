export type LmServerCommandInput = {
  pythonPath: string;
  modelId: string;
  host: string;
  port: number;
};

export type ServerCommand = {
  command: string;
  args: string[];
};

export function buildLmServerCommand({
  pythonPath,
  modelId,
  host,
  port,
}: LmServerCommandInput): ServerCommand {
  return {
    command: pythonPath,
    args: [
      "-m",
      "mlx_lm.server",
      "--model",
      modelId,
      "--host",
      host,
      "--port",
      String(port),
    ],
  };
}
